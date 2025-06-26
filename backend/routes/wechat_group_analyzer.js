const express = require('express');

// ===== 豆包AI配置 =====
const DOUBAO_CONFIG = {
  api_key: process.env.DOUBAO_API_KEY || '',
  api_url: process.env.DOUBAO_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  model_id: process.env.DOUBAO_MODEL_ID || 'ep-20241211142857-8q2fh'
};

// ===== 群消息分析配置 =====
const GROUP_ANALYZER_CONFIG = {
  kfid: process.env.GROUP_ANALYZER_KFID || 'kfcd06249ea89ab96cd',
  max_content_length: parseInt(process.env.MAX_GROUP_CONTENT_LENGTH) || 5000,
  enable_analysis_history: process.env.ENABLE_ANALYSIS_HISTORY === 'true'
};

// 存储处理日志
let groupAnalysisLogs = [];

// 添加处理日志
function addGroupAnalysisLog(type, message, data = null) {
  const log = {
    timestamp: new Date().toISOString(),
    type: type,
    message: message,
    data: data
  };
  
  groupAnalysisLogs.unshift(log);
  if (groupAnalysisLogs.length > 50) {
    groupAnalysisLogs = groupAnalysisLogs.slice(0, 50);
  }
  
  console.log(`[群消息分析] [${type}] ${message}`, data ? JSON.stringify(data).substring(0, 100) : '');
}

// ===== 群消息格式识别 =====
const GROUP_MESSAGE_PATTERNS = [
  // 标准微信群消息格式：用户名: 消息内容
  /^(.+?):\s*(.+)$/gm,
  // 时间戳格式：[时间] 用户名: 消息内容  
  /^\[(\d{1,2}:\d{2})\]\s*(.+?):\s*(.+)$/gm,
  // 转发格式：- 用户名: 消息内容
  /^-\s*(.+?):\s*(.+)$/gm,
  // 带日期格式：2024/1/1 12:00 用户名: 消息内容
  /^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\s+\d{1,2}:\d{2}\s+(.+?):\s*(.+)$/gm
];

// 解析群消息内容
function parseGroupMessages(content) {
  try {
    addGroupAnalysisLog('PARSE', '开始解析群消息内容', { 
      contentLength: content.length,
      contentPreview: content.substring(0, 100) + '...'
    });

    const messages = [];
    let parsedCount = 0;

    // 尝试不同的消息格式模式
    for (const pattern of GROUP_MESSAGE_PATTERNS) {
      const matches = [...content.matchAll(pattern)];
      
      if (matches.length > 0) {
        addGroupAnalysisLog('PARSE', `使用模式匹配到消息`, {
          patternIndex: GROUP_MESSAGE_PATTERNS.indexOf(pattern),
          matchCount: matches.length
        });

        for (const match of matches) {
          let username, messageText, timestamp = null;
          
          if (match.length === 3) {
            // 基础格式：用户名: 消息内容
            [, username, messageText] = match;
          } else if (match.length === 4) {
            // 带时间格式：[时间] 用户名: 消息内容
            [, timestamp, username, messageText] = match;
          }

          if (username && messageText) {
            messages.push({
              username: username.trim(),
              content: messageText.trim(),
              timestamp: timestamp || null,
              originalText: match[0]
            });
            parsedCount++;
          }
        }
        
        // 如果找到匹配的格式，就不再尝试其他格式
        if (messages.length > 0) {
          break;
        }
      }
    }

    // 如果所有格式都没匹配到，尝试按行分割
    if (messages.length === 0) {
      addGroupAnalysisLog('PARSE', '使用模式匹配失败，尝试按行分析');
      
      const lines = content.split('\n').filter(line => line.trim());
      for (const line of lines) {
        if (line.includes(':')) {
          const colonIndex = line.indexOf(':');
          const username = line.substring(0, colonIndex).trim();
          const messageText = line.substring(colonIndex + 1).trim();
          
          if (username && messageText && username.length < 50) {
            messages.push({
              username: username,
              content: messageText,
              timestamp: null,
              originalText: line
            });
            parsedCount++;
          }
        }
      }
    }

    addGroupAnalysisLog('PARSE', '群消息解析完成', {
      totalMessages: messages.length,
      uniqueUsers: [...new Set(messages.map(m => m.username))].length,
      parsedSuccessfully: parsedCount > 0
    });

    return {
      success: parsedCount > 0,
      messages: messages,
      totalCount: messages.length,
      uniqueUsers: [...new Set(messages.map(m => m.username))],
      originalContent: content
    };

  } catch (error) {
    addGroupAnalysisLog('ERROR', '解析群消息失败', {
      error: error.message,
      contentLength: content ? content.length : 0
    });
    return {
      success: false,
      messages: [],
      totalCount: 0,
      uniqueUsers: [],
      error: error.message
    };
  }
}

// ===== 豆包AI调用函数（专为群消息分析优化） =====
async function callDoubaoForGroupAnalysis(groupContent, parsedData) {
  try {
    addGroupAnalysisLog('AI', '开始调用豆包AI进行群消息分析', {
      contentLength: groupContent.length,
      messageCount: parsedData.totalCount,
      userCount: parsedData.uniqueUsers.length
    });

    if (!DOUBAO_CONFIG.api_key) {
      addGroupAnalysisLog('AI', '豆包API密钥未配置，使用模拟分析');
      return generateMockAnalysis(parsedData);
    }

    // 构建专门的群消息分析提示词
    const systemPrompt = `你是一个专业的群聊消息分析助手。请对用户转发的群聊记录进行智能分析，重点关注以下内容：

1. 群聊主要内容总结 - 包括聊天目的、核心结论、讨论中的问题、待办事项
2. 提问清单汇总 - 梳理谁问了什么问题，得到了什么回答
3. 待办事项汇总 - 提取所有需要跟进的任务和行动项

请用简洁、结构化的方式回复，使用emoji增加可读性，确保信息准确完整。`;

    const userPrompt = `请分析以下群聊记录：

参与人数：${parsedData.uniqueUsers.length} 人
消息条数：${parsedData.totalCount} 条
参与者：${parsedData.uniqueUsers.slice(0, 5).join('、')}${parsedData.uniqueUsers.length > 5 ? ' 等' : ''}

群聊内容：
${groupContent}

请按照以下格式详细分析：

📋 群聊主要内容总结：
• 聊天目的：
• 核心结论：
• 讨论中的问题：
• 待办事项：

❓ 提问清单汇总：
• [提问者] 问题：xxx | 回答：xxx
• [提问者] 问题：xxx | 回答：xxx

✅ 待办事项汇总：
• 任务1：负责人 - 具体内容
• 任务2：负责人 - 具体内容`;

    const response = await fetch(DOUBAO_CONFIG.api_url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DOUBAO_CONFIG.api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DOUBAO_CONFIG.model_id,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`豆包API请求失败: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      const aiAnalysis = data.choices[0].message.content.trim();
      
      addGroupAnalysisLog('AI', '豆包AI分析完成', {
        analysisLength: aiAnalysis.length,
        success: true
      });

      return {
        success: true,
        analysis: aiAnalysis,
        metadata: {
          participantCount: parsedData.uniqueUsers.length,
          messageCount: parsedData.totalCount,
          participants: parsedData.uniqueUsers.slice(0, 10) // 最多显示10个参与者
        }
      };
    } else {
      throw new Error('豆包API返回数据格式异常');
    }

  } catch (error) {
    addGroupAnalysisLog('ERROR', '豆包AI调用失败', {
      error: error.message
    });
    
    // 如果API调用失败，返回基础分析
    return generateMockAnalysis(parsedData);
  }
}

// 生成模拟分析（当API不可用时）
function generateMockAnalysis(parsedData) {
  const analysis = `🤖 群消息智能解读

📋 群聊主要内容总结：
• 聊天目的：基于 ${parsedData.totalCount} 条消息的群聊讨论
• 核心结论：共有 ${parsedData.uniqueUsers.length} 位参与者参与了讨论
• 讨论中的问题：涉及多个话题，需要进一步分析具体内容
• 待办事项：待配置AI分析后可提取具体任务

❓ 提问清单汇总：
• [系统提示] 当前为基础分析模式 | 回答：需要配置豆包API以获得详细的问答分析
• [用户] 群聊内容分析需求 | 回答：已识别到群聊格式，等待AI深度分析

✅ 待办事项汇总：
• 配置豆包API：技术人员 - 设置DOUBAO_API_KEY环境变量
• 重新分析群聊：用户 - 配置完成后重新发送群聊内容获得详细分析

⚠️ 注意：当前为基础分析模式，配置AI接口后可获得更智能的分析结果。`;

  return {
    success: true,
    analysis: analysis,
    isMockAnalysis: true,
    metadata: {
      participantCount: parsedData.uniqueUsers.length,
      messageCount: parsedData.totalCount,
      participants: parsedData.uniqueUsers.slice(0, 10)
    }
  };
}

// ===== 主要处理函数 =====
async function processGroupMessage(msg, accessToken) {
  try {
    const external_userid = msg.external_userid;
    const userContent = msg.text?.content || '';
    
    addGroupAnalysisLog('PROCESS', '开始处理群消息分析请求', {
      external_userid,
      contentLength: userContent.length,
      open_kfid: msg.open_kfid
    });

    // 验证是否是群消息分析客服
    if (msg.open_kfid !== GROUP_ANALYZER_CONFIG.kfid) {
      addGroupAnalysisLog('ERROR', '客服ID不匹配', {
        expected: GROUP_ANALYZER_CONFIG.kfid,
        actual: msg.open_kfid
      });
      return '抱歉，此消息不属于群消息分析服务。';
    }

    // 检查消息内容
    if (!userContent || userContent.trim().length < 10) {
      return `👋 欢迎使用群消息智能解读服务！

📱 使用方法：
1. 复制微信群里的聊天记录
2. 直接粘贴发送给我
3. 我会为您智能分析群聊内容

💡 支持格式：
• 用户名: 消息内容
• [时间] 用户名: 消息内容  
• - 用户名: 消息内容

请发送您要分析的群消息内容吧！`;
    }

    // 检查内容长度限制
    if (userContent.length > GROUP_ANALYZER_CONFIG.max_content_length) {
      addGroupAnalysisLog('WARN', '内容超过长度限制', {
        actualLength: userContent.length,
        maxLength: GROUP_ANALYZER_CONFIG.max_content_length
      });
      
      return `📏 内容过长提示

您发送的内容长度为 ${userContent.length} 字符，超过了单次分析限制（${GROUP_ANALYZER_CONFIG.max_content_length} 字符）。

💡 建议：
• 请分段发送群消息内容
• 或者筛选最重要的部分进行分析
• 删除无关的转发信息和表情符号

请重新发送较短的群消息内容。`;
    }

    // 解析群消息内容
    const parseResult = parseGroupMessages(userContent);
    
    if (!parseResult.success || parseResult.totalCount === 0) {
      addGroupAnalysisLog('WARN', '群消息格式识别失败', {
        contentPreview: userContent.substring(0, 200)
      });

      return `🤔 消息格式识别提示

我没有识别到标准的群聊格式。请确保您的消息包含以下格式之一：

✅ 正确格式示例：
张三: 今天会议几点开始？
李四: 下午2点在会议室
王五: 我可能会迟到10分钟

✅ 或者带时间格式：
[14:30] 张三: 项目进度如何？
[14:31] 李四: 基本完成了80%

💡 提示：
• 请确保每行都是"用户名: 消息内容"的格式
• 避免包含过多无关信息
• 可以直接从微信复制群聊记录

请重新发送正确格式的群消息内容。`;
    }

    addGroupAnalysisLog('PROCESS', '群消息解析成功，开始AI分析', {
      messageCount: parseResult.totalCount,
      userCount: parseResult.uniqueUsers.length
    });

    // 调用AI进行分析
    const analysisResult = await callDoubaoForGroupAnalysis(userContent, parseResult);
    
    if (!analysisResult.success) {
      return `❌ 分析处理失败

抱歉，群消息分析遇到了问题。请稍后重试。

如果问题持续存在，请：
• 检查消息格式是否正确
• 确保内容不包含特殊字符
• 联系技术支持获取帮助`;
    }

    // 构建最终回复
    const finalReply = `${analysisResult.analysis}

⏰ 分析时间：${new Date().toLocaleString('zh-CN')}
📊 分析统计：${parseResult.totalCount} 条消息，${parseResult.uniqueUsers.length} 位参与者`;

    addGroupAnalysisLog('SUCCESS', '群消息分析完成', {
      external_userid,
      messageCount: parseResult.totalCount,
      userCount: parseResult.uniqueUsers.length,
      analysisLength: analysisResult.analysis.length,
      isMockAnalysis: analysisResult.isMockAnalysis || false
    });

    return finalReply;

  } catch (error) {
    addGroupAnalysisLog('ERROR', '处理群消息分析失败', {
      external_userid: msg.external_userid,
      error: error.message,
      stack: error.stack
    });

    return `🚫 系统错误

抱歉，群消息分析服务暂时不可用。

错误信息：${error.message}

请稍后重试，或联系技术支持。`;
  }
}

// ===== 导出功能 =====
module.exports = {
  processGroupMessage,
  parseGroupMessages,
  callDoubaoForGroupAnalysis,
  addGroupAnalysisLog,
  
  // 调试和监控接口
  getLogs: () => groupAnalysisLogs,
  getConfig: () => GROUP_ANALYZER_CONFIG
}; 
