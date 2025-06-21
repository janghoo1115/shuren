const express = require('express');
const router = express.Router();
const WeChatCrypto = require('../utils/wechat-crypto');

// 企业微信配置
const WECHAT_CONFIG = {
  token: process.env.WECHAT_TOKEN,
  encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY,
  corpId: process.env.WECHAT_CORP_ID,
  agentId: process.env.WECHAT_AGENT_ID,
  corpSecret: process.env.WECHAT_CORP_SECRET || process.env.WECHAT_SECRET
};

// 创建加密工具实例
const crypto = new WeChatCrypto(
  WECHAT_CONFIG.token,
  WECHAT_CONFIG.encodingAESKey,
  WECHAT_CONFIG.corpId
);

// 存储最近的回调请求（用于调试）
let recentCallbacks = [];

// 存储接收到的客服消息
let customerMessages = [];

// 微信回调处理
router.all('/callback', async (req, res) => {
  try {
    const callbackInfo = {
      timestamp: new Date().toISOString(),
      method: req.method,
      query: req.query,
      headers: req.headers,
      body: req.body,
      ip: req.ip || req.connection.remoteAddress
    };
    
    // 保存最近10个回调请求
    recentCallbacks.unshift(callbackInfo);
    if (recentCallbacks.length > 10) {
      recentCallbacks = recentCallbacks.slice(0, 10);
    }
    
    console.log('收到微信回调请求:', callbackInfo);

    const { msg_signature, timestamp, nonce, echostr } = req.query;

    // GET请求：验证回调URL
    if (req.method === 'GET') {
      if (!msg_signature || !timestamp || !nonce || !echostr) {
        console.log('GET请求参数不完整');
        return res.status(400).send('参数不完整');
      }

      // 验证签名
      const isValid = crypto.verifySignature(msg_signature, timestamp, nonce, echostr);
      console.log('GET请求签名验证结果:', isValid);

      if (isValid) {
        // 解密echostr并返回
        try {
          const decryptedEcho = crypto.decrypt(echostr);
          console.log('解密后的echostr:', decryptedEcho);
          return res.send(decryptedEcho);
        } catch (decryptError) {
          console.error('解密echostr失败:', decryptError);
          return res.status(500).send('解密失败');
        }
      } else {
        return res.status(403).send('签名验证失败');
      }
    }

    // POST请求：处理消息
    if (req.method === 'POST') {
      if (!msg_signature || !timestamp || !nonce) {
        console.log('POST请求参数不完整');
        return res.status(400).send('参数不完整');
      }

      // 获取加密的消息体
      let encryptedMsg;
      let bodyStr = '';
      
      // 处理不同格式的请求体
      if (typeof req.body === 'string') {
        bodyStr = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        bodyStr = req.body.toString('utf8');
      } else if (req.body && typeof req.body === 'object') {
        bodyStr = JSON.stringify(req.body);
      } else {
        console.log('无法解析请求体格式:', typeof req.body);
        return res.status(400).send('请求体格式错误');
      }
      
      console.log('解析的XML字符串:', bodyStr.substring(0, 200) + '...');
      
      // 从XML中提取加密消息
      const xmlMatch = bodyStr.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
      if (xmlMatch) {
        encryptedMsg = xmlMatch[1];
        console.log('提取到的加密消息:', encryptedMsg.substring(0, 50) + '...');
      } else {
        console.log('未找到加密消息体，原始内容:', bodyStr);
        return res.status(400).send('消息格式错误');
      }

      // 验证签名
      const isValid = crypto.verifySignature(msg_signature, timestamp, nonce, encryptedMsg);
      console.log('POST请求签名验证结果:', isValid);

      if (!isValid) {
        return res.status(403).send('签名验证失败');
      }

      // 解密消息
      try {
        const decryptedMsg = crypto.decrypt(encryptedMsg);
        console.log('解密后的消息:', decryptedMsg);

        // 处理消息并获取回复内容
        const replyXml = await handleWeChatMessage(decryptedMsg, timestamp, nonce);
        
        // 如果有回复内容，返回加密的回复；否则返回success
        if (replyXml) {
          return res.send(replyXml);
        } else {
          return res.send('success');
        }
      } catch (decryptError) {
        console.error('解密消息失败:', decryptError);
        return res.status(500).send('解密失败');
      }
    }

    res.status(405).send('方法不被支持');
  } catch (error) {
    console.error('微信回调处理失败:', error);
    res.status(500).send('服务器错误');
  }
});

// 处理微信消息的业务逻辑
async function handleWeChatMessage(message, timestamp, nonce) {
  try {
    console.log('开始处理微信消息...');
    console.log('原始消息长度:', message ? message.length : 0);
    console.log('消息前100字符:', message ? message.substring(0, 100) : 'null');
    
    // 解析XML消息
    const messageData = parseWeChatMessage(message);
    console.log('解析后的消息数据:', JSON.stringify(messageData, null, 2));
    
    // 检查是否成功解析
    if (!messageData) {
      console.log('消息解析失败，原始XML:', message);
      return null;
    }
    
    // 如果是文本消息，记录消息
    if (messageData && messageData.MsgType === 'text') {
      console.log('检测到文本消息类型');
    } else if (messageData) {
      console.log('收到非文本消息，类型:', messageData.MsgType);
    }
    
    if (messageData && messageData.MsgType === 'text') {
      console.log('收到文本消息:', messageData.Content);
      console.log('发送者:', messageData.FromUserName);
      
      // 记录客服消息
      const customerMessage = {
        timestamp: new Date().toISOString(),
        fromUser: messageData.FromUserName,
        toUser: messageData.ToUserName,
        content: messageData.Content,
        msgId: messageData.MsgId,
        msgType: messageData.MsgType,
        createTime: messageData.CreateTime
      };
      
      // 保存最近10条客服消息
      customerMessages.unshift(customerMessage);
      if (customerMessages.length > 10) {
        customerMessages = customerMessages.slice(0, 10);
      }
      
      console.log('=== 客服消息记录 ===');
      console.log('时间:', customerMessage.timestamp);
      console.log('发送者:', customerMessage.fromUser);
      console.log('接收者:', customerMessage.toUser);
      console.log('消息内容:', customerMessage.content);
      console.log('消息ID:', customerMessage.msgId);
      console.log('=====================');
      
      // 暂时注释掉通知功能，因为权限不足
      // try {
      //   await notifyCustomerServiceMessage(messageData);
      // } catch (error) {
      //   console.error('通知客服失败:', error);
      // }
    }
    
    return null; // 不回复
    
  } catch (error) {
    console.error('处理微信消息失败:', error);
    return null;
  }
}

// 解析微信XML消息
function parseWeChatMessage(xmlString) {
  try {
    // 简单的XML解析，提取关键信息
    const patterns = {
      ToUserName: /<ToUserName><!\[CDATA\[(.*?)\]\]><\/ToUserName>/,
      FromUserName: /<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/,
      CreateTime: /<CreateTime>(.*?)<\/CreateTime>/,
      MsgType: /<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/,
      Content: /<Content><!\[CDATA\[(.*?)\]\]><\/Content>/,
      MsgId: /<MsgId>(.*?)<\/MsgId>/
    };
    
    const result = {};
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = xmlString.match(pattern);
      if (match) {
        result[key] = match[1];
      }
    }
    
    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    console.error('解析XML消息失败:', error);
    return null;
  }
}

// 通知企业微信用户有新的客服消息
async function notifyCustomerServiceMessage(messageData) {
  try {
    // 获取access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      throw new Error('获取access_token失败: ' + tokenData.errmsg);
    }

    // 发送通知消息给企业管理员（假设使用@all）
    const notificationMessage = {
      touser: "@all", // 发送给所有企业成员，你也可以指定特定用户
      msgtype: "text",
      agentid: WECHAT_CONFIG.agentId,
      text: {
        content: `📨 收到新的客服消息\n\n发送者: ${messageData.FromUserName}\n内容: ${messageData.Content}\n时间: ${new Date().toLocaleString()}\n\n请及时处理客户咨询！`
      }
    };

    const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(notificationMessage)
    });

    const sendResult = await sendResponse.json();
    
    if (sendResult.errcode === 0) {
      console.log('客服消息通知发送成功:', sendResult);
    } else {
      console.error('客服消息通知发送失败:', sendResult);
    }

  } catch (error) {
    console.error('通知客服消息失败:', error);
    throw error;
  }
}

// 发送自动回复给微信用户（使用被动回复）
async function sendAutoReply(fromUser) {
  try {
    console.log('准备发送自动回复给微信用户:', fromUser);
    
    // 注意：对于微信客服场景，我们需要使用被动回复或客服接口
    // 当前的企业微信应用API只能发送给企业内部用户，不能回复微信用户
    // 真正的微信客服回复需要在handleWeChatMessage中直接返回XML格式的回复
    
    console.log('微信客服消息已接收，如需自动回复请使用被动回复机制');
    
  } catch (error) {
    console.error('处理自动回复失败:', error);
  }
}

// 获取access_token
router.get('/access-token', async (req, res) => {
  try {
    const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const data = await response.json();
    
    if (data.errcode === 0) {
      res.json({ 
        success: true,
        access_token: data.access_token, 
        expires_in: data.expires_in,
        message: '企业微信access_token获取成功'
      });
    } else {
      res.status(400).json({ 
        error: data.errmsg, 
        errcode: data.errcode,
        hint: '请检查企业微信配置'
      });
    }
  } catch (error) {
    console.error('获取access_token失败:', error);
    res.status(500).json({ error: '获取access_token失败', message: error.message });
  }
});

// 发送消息
router.post('/send-message', async (req, res) => {
  try {
    const { touser, msgtype, content } = req.body;
    
    if (!touser || !msgtype || !content) {
      return res.status(400).json({ 
        error: '参数不完整',
        required: 'touser, msgtype, content'
      });
    }

    // 获取access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取access_token失败', details: tokenData });
    }

    // 构建消息体
    let messageBody = {
      touser: touser,
      agentid: WECHAT_CONFIG.agentId,
      msgtype: msgtype
    };

    // 根据消息类型构建不同的消息内容
    switch (msgtype) {
      case 'text':
        messageBody.text = { content: content };
        break;
      case 'markdown':
        messageBody.markdown = { content: content };
        break;
      default:
        return res.status(400).json({ error: '不支持的消息类型', supported: ['text', 'markdown'] });
    }

    // 发送消息
    const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageBody)
    });

    const sendData = await sendResponse.json();
    
    if (sendData.errcode === 0) {
      res.json({
        success: true,
        message: '消息发送成功',
        msgid: sendData.msgid,
        details: sendData
      });
    } else {
      res.status(400).json({ 
        error: '消息发送失败', 
        details: sendData 
      });
    }

  } catch (error) {
    console.error('发送消息失败:', error);
    res.status(500).json({ error: '发送消息失败', message: error.message });
  }
});

// 批量发送消息
router.post('/send-batch-message', async (req, res) => {
  try {
    const { touser_list, msgtype, content } = req.body;
    
    if (!touser_list || !Array.isArray(touser_list) || !msgtype || !content) {
      return res.status(400).json({ 
        error: '参数不完整',
        required: 'touser_list (array), msgtype, content'
      });
    }

    // 获取access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取access_token失败', details: tokenData });
    }

    const results = [];
    
    // 批量发送
    for (const touser of touser_list) {
      try {
        let messageBody = {
          touser: touser,
          agentid: WECHAT_CONFIG.agentId,
          msgtype: msgtype
        };

        if (msgtype === 'text') {
          messageBody.text = { content: content };
        } else if (msgtype === 'markdown') {
          messageBody.markdown = { content: content };
        }

        const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(messageBody)
        });

        const sendData = await sendResponse.json();
        
        results.push({
          touser: touser,
          success: sendData.errcode === 0,
          msgid: sendData.msgid,
          error: sendData.errcode !== 0 ? sendData.errmsg : null
        });

        // 避免频率限制，每次发送间隔100ms
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        results.push({
          touser: touser,
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: '批量消息发送完成',
      results: results,
      total: touser_list.length,
      success_count: results.filter(r => r.success).length,
      failed_count: results.filter(r => !r.success).length
    });

  } catch (error) {
    console.error('批量发送消息失败:', error);
    res.status(500).json({ error: '批量发送消息失败', message: error.message });
  }
});

// 测试自动回复功能
router.post('/test-auto-reply', async (req, res) => {
  try {
    const { touser } = req.body;
    
    if (!touser) {
      return res.status(400).json({ 
        error: '参数不完整',
        required: 'touser'
      });
    }

    await sendAutoReply(touser);
    
    res.json({
      success: true,
      message: '测试自动回复发送完成',
      touser: touser
    });

  } catch (error) {
    console.error('测试自动回复失败:', error);
    res.status(500).json({ error: '测试自动回复失败', message: error.message });
  }
});

// 调试接口：查看最近的回调日志
router.get('/debug/recent-callbacks', (req, res) => {
  res.json({
    recent_callbacks: recentCallbacks,
    callback_count: recentCallbacks.length,
    callback_url: 'https://backend.shurenai.xyz/api/wechat/callback',
    status: '服务正常运行',
    timestamp: new Date().toISOString(),
    message: recentCallbacks.length > 0 ? '有回调记录' : '暂无回调记录，请检查企微配置'
  });
});

// 调试接口：查看接收到的客服消息
router.get('/debug/customer-messages', (req, res) => {
  res.json({
    customer_messages: customerMessages,
    message_count: customerMessages.length,
    status: '消息记录服务正常',
    timestamp: new Date().toISOString(),
    message: customerMessages.length > 0 ? `已记录 ${customerMessages.length} 条客服消息` : '暂无客服消息记录'
  });
});

// 验证企微配置
router.get('/debug/config', (req, res) => {
  res.json({
    corpId: WECHAT_CONFIG.corpId ? '已配置' : '未配置',
    agentId: WECHAT_CONFIG.agentId ? '已配置' : '未配置',
    token: WECHAT_CONFIG.token ? '已配置' : '未配置',
    encodingAESKey: WECHAT_CONFIG.encodingAESKey ? '已配置' : '未配置',
    corpSecret: WECHAT_CONFIG.corpSecret ? '已配置' : '未配置',
    callback_url: 'https://backend.shurenai.xyz/api/wechat/callback'
  });
});

// 手动触发测试消息（用于测试）
router.get('/debug/test-message/:userid', async (req, res) => {
  try {
    const userid = req.params.userid;
    
    // 模拟收到消息并触发自动回复
    await sendAutoReply(userid);
    
    res.json({
      success: true,
      message: `已向用户 ${userid} 发送测试回复`,
      content: '好的收到，我们的客服会尽快为您处理'
    });
  } catch (error) {
    res.status(500).json({
      error: '测试消息发送失败',
      details: error.message
    });
  }
});

// 获取企业用户列表
router.get('/users', async (req, res) => {
  try {
    // 获取access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取access_token失败', details: tokenData });
    }

    // 获取用户列表
    const usersResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/user/list?access_token=${tokenData.access_token}&department_id=1`);
    const usersData = await usersResponse.json();
    
    if (usersData.errcode === 0) {
      const userList = usersData.userlist.map(user => ({
        userid: user.userid,
        name: user.name,
        position: user.position || '未设置',
        department: user.department || [],
        mobile: user.mobile || '未设置'
      }));
      
      res.json({
        success: true,
        users: userList,
        total: userList.length,
        message: '企业用户列表（请使用userid字段作为发送消息的目标）'
      });
    } else {
      res.status(400).json({ 
        error: '获取用户列表失败', 
        details: usersData 
      });
    }

  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败', message: error.message });
  }
});

// 客服回复接口（用于企业用户主动回复微信用户）
router.post('/customer-service-reply', async (req, res) => {
  try {
    const { touser, content, msgtype = 'text' } = req.body;
    
    if (!touser || !content) {
      return res.status(400).json({ 
        error: '参数不完整',
        required: 'touser (微信用户ID), content (回复内容)'
      });
    }

    // 注意：这里只是一个演示接口
    // 真正的微信客服回复需要特殊的客服API，目前企业微信没有直接的客服回复API
    // 实际场景中可能需要通过微信公众号的客服API或其他方式
    
    console.log('收到客服回复请求:', { touser, content, msgtype });
    
    // 这里可以记录到数据库或队列中，等待后续处理
    res.json({
      success: true,
      message: '客服回复已记录，但无法直接发送给微信用户',
      note: '企业微信应用无法直接回复微信用户，需要通过其他渠道或等待微信官方支持',
      touser,
      content,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('客服回复失败:', error);
    res.status(500).json({ error: '客服回复失败', message: error.message });
  }
});

// 检查服务器IP地址
router.get('/check-ip', async (req, res) => {
  try {
    // 通过外部服务获取服务器出站IP
    const response = await fetch('https://httpbin.org/ip');
    const data = await response.json();
    
    res.json({
      success: true,
      server_ip: data.origin,
      timestamp: new Date().toISOString(),
      message: '请将此IP添加到企业微信应用的可信IP列表中'
    });
  } catch (error) {
    res.status(500).json({
      error: '获取IP失败',
      message: error.message
    });
  }
});

// 企业微信功能测试页面
router.get('/test', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>企业微信应用功能测试</title>
    <style>
        body { font-family: 'Microsoft YaHei', sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #1976d2; text-align: center; margin-bottom: 30px; }
        .section { margin-bottom: 30px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px; }
        .section h3 { color: #333; margin-top: 0; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input, textarea, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { background: #1976d2; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; margin-bottom: 10px; }
        button:hover { background: #1565c0; }
        .result { margin-top: 15px; padding: 10px; border-radius: 4px; background: #f8f9fa; border-left: 4px solid #28a745; }
        .error { border-left-color: #dc3545; background: #f8d7da; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 300px; }
        .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; border-left: 4px solid #1976d2; }
        .row { display: flex; gap: 20px; }
        .col { flex: 1; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 企业微信应用功能测试</h1>
        
        <div class="info">
            <h4>📋 功能说明</h4>
            <p>这是<strong>企业微信应用</strong>的功能测试页面，可以测试回调处理、消息发送等核心功能。</p>
            <p><strong>你的客服链接：</strong> <a href="https://work.weixin.qq.com/kfid/kfca677d36885794305" target="_blank">https://work.weixin.qq.com/kfid/kfca677d36885794305</a></p>
            <p><strong>回调地址：</strong> https://backend.shurenai.xyz/api/wechat/callback</p>
        </div>
        
        <!-- 连通性测试 -->
        <div class="section">
            <h3>🔍 1. 连通性测试</h3>
            <div class="row">
                <div class="col">
                    <h4>获取Access Token</h4>
                    <button onclick="getAccessToken()">获取Access Token</button>
                    <div id="token-result"></div>
                </div>
                <div class="col">
                    <h4>检查配置</h4>
                    <button onclick="checkConfig()">检查企微配置</button>
                    <div id="config-result"></div>
                </div>
            </div>
        </div>
        
        <!-- 用户管理 -->
        <div class="section">
            <h3>👥 2. 用户管理</h3>
            <div class="row">
                <div class="col">
                    <h4>获取企业用户列表</h4>
                    <button onclick="getUsers()">获取用户列表</button>
                    <div id="users-result"></div>
                </div>
                <div class="col">
                    <h4>查看回调日志</h4>
                    <button onclick="getCallbacks()">查看最近回调</button>
                    <div id="callbacks-result"></div>
                </div>
            </div>
        </div>
        
        <!-- 消息发送 -->
        <div class="section">
            <h3>💬 3. 消息发送</h3>
            <div class="row">
                <div class="col">
                    <h4>发送单条消息</h4>
                    <div class="form-group">
                        <label>用户ID (userid):</label>
                        <input type="text" id="touser" placeholder="企业微信用户ID">
                    </div>
                    <div class="form-group">
                        <label>消息类型:</label>
                        <select id="msgtype">
                            <option value="text">文本消息</option>
                            <option value="markdown">Markdown消息</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>消息内容:</label>
                        <textarea id="content" rows="3" placeholder="输入消息内容"></textarea>
                    </div>
                    <button onclick="sendMessage()">发送消息</button>
                    <div id="send-result"></div>
                </div>
                <div class="col">
                    <h4>测试自动回复</h4>
                    <div class="form-group">
                        <label>用户ID:</label>
                        <input type="text" id="test-userid" placeholder="测试自动回复的用户ID">
                    </div>
                    <button onclick="testAutoReply()">测试自动回复</button>
                    <div id="auto-reply-result"></div>
                </div>
            </div>
        </div>
        
        <!-- 批量操作 -->
        <div class="section">
            <h3>📊 4. 批量操作</h3>
            <div class="form-group">
                <label>用户ID列表 (用逗号分隔):</label>
                <input type="text" id="batch-users" placeholder="user1,user2,user3">
            </div>
            <div class="form-group">
                <label>批量消息内容:</label>
                <textarea id="batch-content" rows="3" placeholder="批量发送的消息内容"></textarea>
            </div>
            <button onclick="sendBatchMessage()">批量发送消息</button>
            <div id="batch-result"></div>
        </div>
    </div>

    <script>
        async function getAccessToken() {
            try {
                const response = await fetch('/api/wechat/access-token');
                const data = await response.json();
                document.getElementById('token-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('token-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function checkConfig() {
            try {
                const response = await fetch('/api/wechat/debug/config');
                const data = await response.json();
                document.getElementById('config-result').innerHTML = 
                    \`<div class="result"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('config-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function getUsers() {
            try {
                const response = await fetch('/api/wechat/users');
                const data = await response.json();
                document.getElementById('users-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('users-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function getCallbacks() {
            try {
                const response = await fetch('/api/wechat/debug/recent-callbacks');
                const data = await response.json();
                document.getElementById('callbacks-result').innerHTML = 
                    \`<div class="result"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('callbacks-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function sendMessage() {
            const touser = document.getElementById('touser').value;
            const msgtype = document.getElementById('msgtype').value;
            const content = document.getElementById('content').value;

            if (!touser || !content) {
                alert('请填写完整信息');
                return;
            }

            try {
                const response = await fetch('/api/wechat/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ touser, msgtype, content })
                });
                const data = await response.json();
                document.getElementById('send-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('send-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function testAutoReply() {
            const touser = document.getElementById('test-userid').value;
            if (!touser) {
                alert('请输入用户ID');
                return;
            }

            try {
                const response = await fetch('/api/wechat/test-auto-reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ touser })
                });
                const data = await response.json();
                document.getElementById('auto-reply-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('auto-reply-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function sendBatchMessage() {
            const users = document.getElementById('batch-users').value;
            const content = document.getElementById('batch-content').value;

            if (!users || !content) {
                alert('请填写用户列表和消息内容');
                return;
            }

            const touser_list = users.split(',').map(u => u.trim()).filter(u => u);
            
            try {
                const response = await fetch('/api/wechat/send-batch-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        touser_list, 
                        msgtype: 'text', 
                        content 
                    })
                });
                const data = await response.json();
                document.getElementById('batch-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('batch-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

module.exports = router; 
