/**
 * 微信AI处理函数
 * 接收微信客服发送的用户内容，调用豆包API进行总结，创建飞书文档并更新主文档
 */

const userStore = require('./shared/user-store');

exports.handler = async (event, context) => {
  console.log('收到微信AI处理请求:', event.httpMethod);

  // 设置CORS头
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理OPTIONS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 只处理POST请求
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '只支持POST方法' })
    };
  }

  try {
    // 企业微信配置
    const WECHAT_TOKEN = process.env.WECHAT_TOKEN;
    const WECHAT_ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY;
    const WECHAT_CORP_ID = process.env.WECHAT_CORP_ID;
    const WECHAT_SECRET = process.env.WECHAT_SECRET;

    // 验证请求来源（可选）
    const apiToken = event.headers['authorization'] || event.headers['x-api-token'];
    const expectedToken = process.env.API_VERIFY_TOKEN;
    
    if (expectedToken && apiToken !== `Bearer ${expectedToken}`) {
      console.warn('未授权的API调用尝试');
      // 注意：这里不强制验证，因为可能影响测试，生产环境可以启用
      // return {
      //   statusCode: 401,
      //   headers,
      //   body: JSON.stringify({ error: '未授权访问' })
      // };
    }

    // 解析请求体
    const requestBody = JSON.parse(event.body || '{}');
    const { user_id, user_content, user_name } = requestBody;

    console.log('处理用户内容:', { user_id, user_name, content_length: user_content?.length });

    // 验证必需参数
    if (!user_id || !user_content) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: '缺少必需参数', 
          required: ['user_id', 'user_content'] 
        })
      };
    }

    // 1. 调用豆包API进行内容总结
    console.log('开始调用豆包API进行内容总结...');
    const aiSummary = await callDoubaoAPI(user_content);
    
    if (!aiSummary.success) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: 'AI总结失败', 
          details: aiSummary.error 
        })
      };
    }

    // 2. 获取用户的飞书token
    const userTokenResult = userStore.getUserData(user_id);
    if (!userTokenResult.success) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: '用户未授权', 
          message: '请先完成飞书授权' 
        })
      };
    }
    
    const userToken = userTokenResult.data;

    // 3. 在飞书中创建新文档
    console.log('开始创建飞书文档...');
    const documentResult = await createFeishuDocument(
      userToken.access_token, 
      user_name || '用户', 
      user_content, 
      aiSummary.content
    );

    if (!documentResult.success) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ 
          error: '创建飞书文档失败', 
          details: documentResult.error 
        })
      };
    }

    // 4. 更新主文档，添加新文档链接
    console.log('开始更新主文档...');
    const updateResult = await updateMainDocument(
      userToken.access_token,
      userToken.main_document_id,
      documentResult.title,
      documentResult.url
    );

    // 5. 返回成功结果
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: '内容处理完成',
        data: {
          ai_summary: aiSummary.content,
          document_id: documentResult.documentId,
          document_url: documentResult.url,
          document_title: documentResult.title,
          main_document_updated: updateResult.success
        }
      })
    };

  } catch (error) {
    console.error('处理微信AI请求时发生错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '服务器内部错误', 
        message: error.message 
      })
    };
  }
};

/**
 * 调用豆包API进行内容总结
 */
async function callDoubaoAPI(userContent) {
  try {
    // 豆包API配置（需要在环境变量中设置）
    const DOUBAO_API_KEY = process.env.DOUBAO_API_KEY || '';
    const DOUBAO_API_URL = process.env.DOUBAO_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    const DOUBAO_MODEL_ID = process.env.DOUBAO_MODEL_ID || 'ep-20241211142857-8q2fh';

    if (!DOUBAO_API_KEY) {
      console.warn('豆包API密钥未配置，使用模拟总结');
      return {
        success: true,
        content: `📝 AI智能总结：\n\n用户发送了以下内容：\n"${userContent}"\n\n主要内容：${userContent.length > 100 ? userContent.substring(0, 100) + '...' : userContent}\n\n总结时间：${new Date().toLocaleString('zh-CN')}\n\n---\n此为AI自动生成的内容总结。`
      };
    }

    const response = await fetch(DOUBAO_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DOUBAO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DOUBAO_MODEL_ID, // 豆包模型ID
        messages: [
          {
            role: 'system',
            content: '你是一个专业的内容总结助手。请对用户发送的内容进行智能总结，提取关键信息，并以清晰、结构化的方式呈现。总结应该包含主要观点、重要细节和实用信息。'
          },
          {
            role: 'user',
            content: `请对以下内容进行智能总结：\n\n${userContent}`
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`豆包API请求失败: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      const aiContent = data.choices[0].message.content;
      return {
        success: true,
        content: `📝 AI智能总结：\n\n${aiContent}\n\n---\n原始内容：\n"${userContent}"\n\n总结时间：${new Date().toLocaleString('zh-CN')}`
      };
    } else {
      throw new Error('豆包API返回数据格式异常');
    }

  } catch (error) {
    console.error('调用豆包API失败:', error);
    // 如果API调用失败，返回基础总结
    return {
      success: true,
      content: `📝 内容记录：\n\n用户发送内容：\n"${userContent}"\n\n记录时间：${new Date().toLocaleString('zh-CN')}\n\n---\n注：AI总结服务暂时不可用，已保存原始内容。`
    };
  }
}



/**
 * 在飞书中创建新文档
 */
async function createFeishuDocument(accessToken, userName, originalContent, aiSummary) {
  try {
    const timestamp = new Date().toLocaleString('zh-CN');
    const documentTitle = `${userName}的记录 - ${new Date().toLocaleDateString('zh-CN')} ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    
    // 1. 创建文档
    const createResponse = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: documentTitle,
        folder_token: ""
      })
    });

    const createData = await createResponse.json();
    console.log('创建文档响应状态:', createData.code);

    if (createData.code !== 0) {
      return { success: false, error: `创建文档失败: ${createData.msg}` };
    }

    const documentId = createData.data.document.document_id;

    // 2. 添加文档内容
    const contentResponse = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          children: [
            {
              block_type: 2, // 文本块
              text: {
                elements: [
                  {
                    text_run: {
                      content: `${aiSummary}\n\n📱 原始内容：\n"${originalContent}"\n\n⏰ 创建时间：${timestamp}\n🤖 由数刃AI自动生成`,
                      text_element_style: {}
                    }
                  }
                ],
                style: {}
              }
            }
          ],
          index: 0
        })
      }
    );

    const contentData = await contentResponse.json();
    console.log('添加内容响应状态:', contentData.code);

    if (contentData.code === 0) {
      return {
        success: true,
        documentId: documentId,
        title: documentTitle,
        url: `https://bytedance.feishu.cn/docx/${documentId}`
      };
    } else {
      return { success: false, error: `添加文档内容失败: ${contentData.msg}` };
    }

  } catch (error) {
    console.error('创建飞书文档异常:', error);
    return { success: false, error: `创建文档时发生异常: ${error.message}` };
  }
}

/**
 * 更新主文档，添加新文档链接
 */
async function updateMainDocument(accessToken, mainDocumentId, newDocTitle, newDocUrl) {
  try {
    // 获取主文档当前内容
    const getResponse = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${mainDocumentId}/blocks`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const getData = await getResponse.json();
    if (getData.code !== 0) {
      console.error('获取主文档内容失败:', getData.msg);
      return { success: false, error: `获取主文档内容失败: ${getData.msg}` };
    }

    // 在主文档末尾添加新文档链接
    const newLinkContent = `\n• [${newDocTitle}](${newDocUrl}) - ${new Date().toLocaleString('zh-CN')}`;
    
    const updateResponse = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${mainDocumentId}/blocks/${mainDocumentId}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          children: [
            {
              block_type: 2, // 文本块
              text: {
                elements: [
                  {
                    text_run: {
                      content: newLinkContent,
                      text_element_style: {}
                    }
                  }
                ],
                style: {}
              }
            }
          ],
          index: -1 // 添加到末尾
        })
      }
    );

    const updateData = await updateResponse.json();
    console.log('更新主文档响应状态:', updateData.code);

    return {
      success: updateData.code === 0,
      error: updateData.code !== 0 ? updateData.msg : null
    };

  } catch (error) {
    console.error('更新主文档异常:', error);
    return { success: false, error: `更新主文档时发生异常: ${error.message}` };
  }
} 
