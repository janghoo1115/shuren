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

        // 处理消息（这里可以添加具体的业务逻辑）
        await handleWeChatMessage(decryptedMsg);

        // 返回success
        return res.send('success');
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
async function handleWeChatMessage(message) {
  try {
    console.log('处理微信消息:', message);
    
    // 解析XML消息
    const messageData = parseWeChatMessage(message);
    console.log('解析后的消息数据:', messageData);
    
    // 如果是文本消息，自动回复
    if (messageData && messageData.MsgType === 'text') {
      await sendAutoReply(messageData.FromUserName);
    }
    
  } catch (error) {
    console.error('处理微信消息失败:', error);
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

// 发送自动回复
async function sendAutoReply(fromUser) {
  try {
    console.log('准备发送自动回复给用户:', fromUser);
    
    // 获取access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      console.error('获取access_token失败:', tokenData);
      return;
    }

    // 构建自动回复消息
    const replyMessage = {
      touser: fromUser,
      agentid: WECHAT_CONFIG.agentId,
      msgtype: 'text',
      text: {
        content: '好的收到'
      }
    };

    // 发送回复消息
    const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(replyMessage)
    });

    const sendData = await sendResponse.json();
    
    if (sendData.errcode === 0) {
      console.log('自动回复发送成功:', sendData);
    } else {
      console.error('自动回复发送失败:', sendData);
    }

  } catch (error) {
    console.error('发送自动回复失败:', error);
  }
}

// 获取access_token
router.get('/access-token', async (req, res) => {
  try {
    const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const data = await response.json();
    
    if (data.errcode === 0) {
      res.json({ access_token: data.access_token, expires_in: data.expires_in });
    } else {
      res.status(400).json({ error: data.errmsg });
    }
  } catch (error) {
    console.error('获取access_token失败:', error);
    res.status(500).json({ error: '获取access_token失败' });
  }
});

// 发送客服消息
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
      content: '好的收到'
    });
  } catch (error) {
    res.status(500).json({
      error: '测试消息发送失败',
      details: error.message
    });
  }
});

// ===== 企业微信客服接口 =====

// 获取客服接口凭证
router.get('/kf/access-token', async (req, res) => {
  try {
    const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const data = await response.json();
    
    if (data.errcode === 0) {
      res.json({ 
        access_token: data.access_token, 
        expires_in: data.expires_in,
        message: '客服接口凭证获取成功'
      });
    } else {
      res.status(400).json({ error: data.errmsg, errcode: data.errcode });
    }
  } catch (error) {
    console.error('获取客服access_token失败:', error);
    res.status(500).json({ error: '获取客服access_token失败' });
  }
});

// 客服消息回调处理
router.all('/kf/callback', async (req, res) => {
  try {
    console.log('收到客服回调请求:', {
      method: req.method,
      query: req.query,
      body: req.body
    });

    const { msg_signature, timestamp, nonce, echostr } = req.query;

    // GET请求：验证回调URL
    if (req.method === 'GET') {
      if (!msg_signature || !timestamp || !nonce || !echostr) {
        return res.status(400).send('参数不完整');
      }

      // 验证签名
      const isValid = crypto.verifySignature(msg_signature, timestamp, nonce, echostr);
      console.log('客服GET请求签名验证结果:', isValid);

      if (isValid) {
        try {
          const decryptedEcho = crypto.decrypt(echostr);
          console.log('客服解密后的echostr:', decryptedEcho);
          return res.send(decryptedEcho);
        } catch (decryptError) {
          console.error('客服解密echostr失败:', decryptError);
          return res.status(500).send('解密失败');
        }
      } else {
        return res.status(403).send('签名验证失败');
      }
    }

    // POST请求：处理客服消息
    if (req.method === 'POST') {
      if (!msg_signature || !timestamp || !nonce) {
        return res.status(400).send('参数不完整');
      }

      // 处理请求体
      let bodyStr = '';
      if (typeof req.body === 'string') {
        bodyStr = req.body;
      } else if (Buffer.isBuffer(req.body)) {
        bodyStr = req.body.toString('utf8');
      } else {
        bodyStr = JSON.stringify(req.body);
      }

      console.log('客服消息原始内容:', bodyStr);

      // 提取加密消息
      const xmlMatch = bodyStr.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
      if (!xmlMatch) {
        return res.status(400).send('消息格式错误');
      }

      const encryptedMsg = xmlMatch[1];

      // 验证签名
      const isValid = crypto.verifySignature(msg_signature, timestamp, nonce, encryptedMsg);
      if (!isValid) {
        return res.status(403).send('签名验证失败');
      }

      // 解密消息
      try {
        const decryptedMsg = crypto.decrypt(encryptedMsg);
        console.log('客服解密后的消息:', decryptedMsg);

        // 处理客服消息
        await handleKfMessage(decryptedMsg);

        return res.send('success');
      } catch (decryptError) {
        console.error('客服解密消息失败:', decryptError);
        return res.status(500).send('解密失败');
      }
    }

    res.status(405).send('方法不被支持');
  } catch (error) {
    console.error('客服回调处理失败:', error);
    res.status(500).send('服务器错误');
  }
});

// 处理客服消息
async function handleKfMessage(message) {
  try {
    console.log('处理客服消息:', message);
    
    // 解析XML消息
    const messageData = parseKfMessage(message);
    console.log('解析后的客服消息数据:', messageData);
    
    // 如果是来自微信用户的文本消息，自动回复
    if (messageData && messageData.MsgType === 'text' && messageData.FromUserName) {
      await sendKfAutoReply(messageData.FromUserName, messageData.OpenKfId);
    }
    
  } catch (error) {
    console.error('处理客服消息失败:', error);
  }
}

// 解析客服XML消息
function parseKfMessage(xmlString) {
  try {
    const patterns = {
      ToUserName: /<ToUserName><!\[CDATA\[(.*?)\]\]><\/ToUserName>/,
      FromUserName: /<FromUserName><!\[CDATA\[(.*?)\]\]><\/FromUserName>/,
      CreateTime: /<CreateTime>(.*?)<\/CreateTime>/,
      MsgType: /<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/,
      Content: /<Content><!\[CDATA\[(.*?)\]\]><\/Content>/,
      MsgId: /<MsgId>(.*?)<\/MsgId>/,
      OpenKfId: /<OpenKfId><!\[CDATA\[(.*?)\]\]><\/OpenKfId>/
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
    console.error('解析客服XML消息失败:', error);
    return null;
  }
}

// 发送客服自动回复（使用现有应用接口）
async function sendKfAutoReply(fromUser, openKfId) {
  try {
    console.log('准备发送客服自动回复给微信用户:', fromUser);
    
    // 先尝试客服接口，失败则使用应用接口
    let tokenData;
    
    // 尝试获取客服access_token
    try {
      const kfTokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
      const kfTokenData = await kfTokenResponse.json();
      
      if (kfTokenData.errcode === 0) {
        tokenData = kfTokenData;
        console.log('使用客服接口发送回复');
        
        // 构建客服回复消息
        const replyMessage = {
          touser: fromUser,
          open_kfid: openKfId,
          msgtype: 'text',
          text: {
            content: '好的收到，我们的客服会尽快为您处理'
          }
        };

        // 发送客服回复消息
        const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${tokenData.access_token}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(replyMessage)
        });

        const sendData = await sendResponse.json();
        
        if (sendData.errcode === 0) {
          console.log('客服自动回复发送成功:', sendData);
          return;
        } else {
          console.error('客服自动回复发送失败，尝试应用接口:', sendData);
        }
      }
    } catch (kfError) {
      console.log('客服接口不可用，使用应用接口:', kfError.message);
    }
    
    // fallback到应用接口
    const appTokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const appTokenData = await appTokenResponse.json();
    
    if (appTokenData.errcode !== 0) {
      console.error('获取应用access_token失败:', appTokenData);
      return;
    }

    console.log('使用应用接口发送回复给用户:', fromUser);

    // 构建应用回复消息
    const replyMessage = {
      touser: fromUser,
      agentid: WECHAT_CONFIG.agentId,
      msgtype: 'text',
      text: {
        content: '好的收到，我们的客服会尽快为您处理'
      }
    };

    // 发送应用回复消息
    const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${appTokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(replyMessage)
    });

    const sendData = await sendResponse.json();
    
    if (sendData.errcode === 0) {
      console.log('应用自动回复发送成功:', sendData);
    } else {
      console.error('应用自动回复发送失败:', sendData);
    }

  } catch (error) {
    console.error('发送自动回复失败:', error);
  }
}

// 获取客服账号列表
router.get('/kf/account/list', async (req, res) => {
  try {
    // 获取客服access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取access_token失败', details: tokenData });
    }

    // 获取客服账号列表
    const listResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/list?access_token=${tokenData.access_token}&offset=0&limit=100`);
    const listData = await listResponse.json();
    
    if (listData.errcode === 0) {
      res.json({
        success: true,
        accounts: listData.account_list,
        total: listData.account_list ? listData.account_list.length : 0
      });
    } else {
      res.status(400).json({ error: '获取客服账号列表失败', details: listData });
    }

  } catch (error) {
    console.error('获取客服账号列表失败:', error);
    res.status(500).json({ error: '获取客服账号列表失败', message: error.message });
  }
});

module.exports = router; 
