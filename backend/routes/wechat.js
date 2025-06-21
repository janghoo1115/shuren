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
    // 使用应用secret获取客服接口凭证
    const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const data = await response.json();
    
    if (data.errcode === 0) {
      res.json({ 
        access_token: data.access_token, 
        expires_in: data.expires_in,
        message: '客服接口凭证获取成功'
      });
    } else {
      res.status(400).json({ 
        error: data.errmsg, 
        errcode: data.errcode,
        hint: '请检查是否配置了正确的应用密钥(WECHAT_CORP_SECRET)',
        corpId: WECHAT_CONFIG.corpId ? '已配置' : '未配置',
        corpSecret: WECHAT_CONFIG.corpSecret ? '已配置' : '未配置'
      });
    }
  } catch (error) {
    console.error('获取客服access_token失败:', error);
    res.status(500).json({ 
      error: '获取客服access_token失败',
      details: error.message,
      corpId: WECHAT_CONFIG.corpId ? '已配置' : '未配置',
      corpSecret: WECHAT_CONFIG.corpSecret ? '已配置' : '未配置'
    });
  }
});

// 客服事件回调处理（根据官方文档正确实现）
router.all('/kf/callback', async (req, res) => {
  try {
    console.log('收到客服事件回调:', {
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

    // POST请求：处理客服事件
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

      console.log('客服事件原始内容:', bodyStr);

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

      // 解密事件
      try {
        const decryptedMsg = crypto.decrypt(encryptedMsg);
        console.log('客服解密后的事件:', decryptedMsg);

        // 处理客服事件（kf_msg_or_event）
        await handleKfEvent(decryptedMsg);

        return res.send('success');
      } catch (decryptError) {
        console.error('客服解密事件失败:', decryptError);
        return res.status(500).send('解密失败');
      }
    }

    res.status(405).send('方法不被支持');
  } catch (error) {
    console.error('客服回调处理失败:', error);
    res.status(500).send('服务器错误');
  }
});

// 处理客服事件（根据官方文档）
async function handleKfEvent(eventData) {
  try {
    console.log('处理客服事件:', eventData);
    
    // 解析XML事件
    const event = parseKfEvent(eventData);
    console.log('解析后的客服事件数据:', event);
    
    // 如果是kf_msg_or_event事件，说明有新消息
    if (event && event.Event === 'kf_msg_or_event') {
      console.log('检测到新消息事件，开始拉取消息...');
      
      // 使用token主动拉取消息
      await pullAndProcessMessages(event.Token, event.OpenKfId);
    }
    
  } catch (error) {
    console.error('处理客服事件失败:', error);
  }
}

// 解析客服XML事件
function parseKfEvent(xmlString) {
  try {
    const patterns = {
      ToUserName: /<ToUserName><!\[CDATA\[(.*?)\]\]><\/ToUserName>/,
      CreateTime: /<CreateTime>(.*?)<\/CreateTime>/,
      MsgType: /<MsgType><!\[CDATA\[(.*?)\]\]><\/MsgType>/,
      Event: /<Event><!\[CDATA\[(.*?)\]\]><\/Event>/,
      Token: /<Token><!\[CDATA\[(.*?)\]\]><\/Token>/,
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
    console.error('解析客服XML事件失败:', error);
    return null;
  }
}

// 拉取并处理消息（根据官方文档）
async function pullAndProcessMessages(token, openKfId) {
  try {
    console.log('开始拉取消息，token:', token, 'openKfId:', openKfId);
    
    // 获取客服access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      console.error('获取客服access_token失败:', tokenData);
      return;
    }
    
    // 调用sync_msg接口拉取消息
    const syncRequest = {
      token: token,
      limit: 100,
      voice_format: 0,
      open_kfid: openKfId
    };
    
    const syncResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(syncRequest)
    });
    
    const syncData = await syncResponse.json();
    console.log('消息拉取结果:', syncData);
    
    if (syncData.errcode === 0 && syncData.msg_list) {
      // 处理每条消息
      for (const msg of syncData.msg_list) {
        await processKfMessage(msg, openKfId);
      }
    } else {
      console.error('拉取消息失败:', syncData);
    }
    
  } catch (error) {
    console.error('拉取消息失败:', error);
  }
}

// 处理单条客服消息
async function processKfMessage(msg, openKfId) {
  try {
    console.log('处理客服消息:', msg);
    
    // 只处理来自微信客户的文本消息 (origin: 3)
    if (msg.origin === 3 && msg.msgtype === 'text') {
      console.log('检测到微信客户文本消息，准备自动回复...');
      
      // 自动回复
      await sendKfAutoReply(msg.external_userid, openKfId);
    }
    
  } catch (error) {
    console.error('处理客服消息失败:', error);
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
        
        // 构建客服回复消息（根据官方API文档）
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
    // 获取客服 access_token
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

// 发送客服消息（根据官方文档支持多种消息类型）
router.post('/kf/send-message', async (req, res) => {
  try {
    const { touser, open_kfid, msgtype, content, ...otherData } = req.body;
    
    if (!touser || !open_kfid || !msgtype) {
      return res.status(400).json({ 
        error: '参数不完整',
        required: 'touser, open_kfid, msgtype'
      });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 构建消息体
    let messageBody = {
      touser: touser,
      open_kfid: open_kfid,
      msgtype: msgtype
    };

    // 根据消息类型构建不同的消息内容
    switch (msgtype) {
      case 'text':
        if (!content) {
          return res.status(400).json({ error: '文本消息需要content参数' });
        }
        messageBody.text = { content: content };
        break;
        
      case 'image':
        if (!otherData.media_id) {
          return res.status(400).json({ error: '图片消息需要media_id参数' });
        }
        messageBody.image = { media_id: otherData.media_id };
        break;
        
      case 'voice':
        if (!otherData.media_id) {
          return res.status(400).json({ error: '语音消息需要media_id参数' });
        }
        messageBody.voice = { media_id: otherData.media_id };
        break;
        
      case 'video':
        if (!otherData.media_id) {
          return res.status(400).json({ error: '视频消息需要media_id参数' });
        }
        messageBody.video = { media_id: otherData.media_id };
        break;
        
      case 'file':
        if (!otherData.media_id) {
          return res.status(400).json({ error: '文件消息需要media_id参数' });
        }
        messageBody.file = { media_id: otherData.media_id };
        break;
        
      case 'link':
        if (!otherData.title || !otherData.url || !otherData.thumb_media_id) {
          return res.status(400).json({ error: '链接消息需要title, url, thumb_media_id参数' });
        }
        messageBody.link = {
          title: otherData.title,
          desc: otherData.desc || '',
          url: otherData.url,
          thumb_media_id: otherData.thumb_media_id
        };
        break;
        
      case 'miniprogram':
        if (!otherData.appid || !otherData.thumb_media_id || !otherData.pagepath) {
          return res.status(400).json({ error: '小程序消息需要appid, thumb_media_id, pagepath参数' });
        }
        messageBody.miniprogram = {
          appid: otherData.appid,
          title: otherData.title || '',
          thumb_media_id: otherData.thumb_media_id,
          pagepath: otherData.pagepath
        };
        break;
        
      case 'location':
        if (otherData.latitude === undefined || otherData.longitude === undefined) {
          return res.status(400).json({ error: '地理位置消息需要latitude, longitude参数' });
        }
        messageBody.location = {
          name: otherData.name || '',
          address: otherData.address || '',
          latitude: otherData.latitude,
          longitude: otherData.longitude
        };
        break;
        
      case 'msgmenu':
        if (!otherData.list || !Array.isArray(otherData.list)) {
          return res.status(400).json({ error: '菜单消息需要list参数（数组）' });
        }
        messageBody.msgmenu = {
          head_content: otherData.head_content || '',
          list: otherData.list,
          tail_content: otherData.tail_content || ''
        };
        break;
        
      case 'ca_link':
        if (!otherData.link_url) {
          return res.status(400).json({ error: '获客链接消息需要link_url参数' });
        }
        messageBody.ca_link = {
          link_url: otherData.link_url
        };
        break;
        
      default:
        return res.status(400).json({ 
          error: '不支持的消息类型', 
          supported: ['text', 'image', 'voice', 'video', 'file', 'link', 'miniprogram', 'location', 'msgmenu', 'ca_link']
        });
    }

    // 如果指定了msgid，添加到消息体中
    if (otherData.msgid) {
      messageBody.msgid = otherData.msgid;
    }

    // 发送消息
    const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg?access_token=${tokenData.access_token}`, {
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
        message: '客服消息发送成功',
        msgid: sendData.msgid,
        details: sendData
      });
    } else {
      res.status(400).json({ 
        error: '客服消息发送失败', 
        details: sendData 
      });
    }

  } catch (error) {
    console.error('发送客服消息失败:', error);
    res.status(500).json({ error: '发送客服消息失败', message: error.message });
  }
});

// 获取会话状态
router.post('/kf/service-state/get', async (req, res) => {
  try {
    const { open_kfid, external_userid } = req.body;
    
    if (!open_kfid || !external_userid) {
      return res.status(400).json({ 
        error: '参数不完整',
        required: 'open_kfid, external_userid'
      });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 获取会话状态
    const stateRequest = {
      open_kfid: open_kfid,
      external_userid: external_userid
    };

    const stateResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/get?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(stateRequest)
    });

    const stateData = await stateResponse.json();
    
    if (stateData.errcode === 0) {
      // 状态说明映射
      const stateMap = {
        0: '未处理',
        1: '由智能助手接待',
        2: '待接入池排队中',
        3: '由人工接待',
        4: '已结束/未开始'
      };

      res.json({
        success: true,
        service_state: stateData.service_state,
        service_state_desc: stateMap[stateData.service_state] || '未知状态',
        servicer_userid: stateData.servicer_userid || null,
        details: stateData
      });
    } else {
      res.status(400).json({ 
        error: '获取会话状态失败', 
        details: stateData 
      });
    }

  } catch (error) {
    console.error('获取会话状态失败:', error);
    res.status(500).json({ error: '获取会话状态失败', message: error.message });
  }
});

// 变更会话状态
router.post('/kf/service-state/trans', async (req, res) => {
  try {
    const { open_kfid, external_userid, service_state, servicer_userid } = req.body;
    
    if (!open_kfid || !external_userid || service_state === undefined) {
      return res.status(400).json({ 
        error: '参数不完整',
        required: 'open_kfid, external_userid, service_state'
      });
    }

    // 验证service_state有效性
    if (![0, 1, 2, 3, 4].includes(service_state)) {
      return res.status(400).json({ 
        error: '无效的service_state值',
        valid_values: [0, 1, 2, 3, 4],
        descriptions: {
          0: '未处理',
          1: '由智能助手接待',
          2: '待接入池排队中',
          3: '由人工接待',
          4: '已结束/未开始'
        }
      });
    }

    // 如果变更为人工接待状态，必须提供servicer_userid
    if (service_state === 3 && !servicer_userid) {
      return res.status(400).json({ 
        error: '变更为人工接待状态时，必须提供servicer_userid'
      });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();
    
    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 变更会话状态
    const transRequest = {
      open_kfid: open_kfid,
      external_userid: external_userid,
      service_state: service_state
    };

    // 如果提供了servicer_userid，添加到请求中
    if (servicer_userid) {
      transRequest.servicer_userid = servicer_userid;
    }

    const transResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/service_state/trans?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(transRequest)
    });

    const transData = await transResponse.json();
    
    if (transData.errcode === 0) {
      const stateMap = {
        0: '未处理',
        1: '由智能助手接待',
        2: '待接入池排队中',
        3: '由人工接待',
        4: '已结束/未开始'
      };

      res.json({
        success: true,
        message: `会话状态已变更为: ${stateMap[service_state]}`,
        service_state: service_state,
        msg_code: transData.msg_code || null,
        details: transData
      });
    } else {
      res.status(400).json({ 
        error: '变更会话状态失败', 
        details: transData 
      });
    }

  } catch (error) {
    console.error('变更会话状态失败:', error);
    res.status(500).json({ error: '变更会话状态失败', message: error.message });
  }
});

// 客服功能测试页面
router.get('/kf/test', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>企业微信客服功能测试</title>
    <style>
        body { font-family: 'Microsoft YaHei', sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #1976d2; text-align: center; margin-bottom: 30px; }
        .section { margin-bottom: 30px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px; }
        .section h3 { color: #333; margin-top: 0; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; color: #555; }
        input, textarea, select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { background: #1976d2; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
        button:hover { background: #1565c0; }
        .result { margin-top: 15px; padding: 10px; border-radius: 4px; background: #f8f9fa; border-left: 4px solid #28a745; }
        .error { border-left-color: #dc3545; background: #f8d7da; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 企业微信客服功能测试</h1>
        
        <!-- 获取客服账号列表 -->
        <div class="section">
            <h3>📋 1. 获取客服账号列表</h3>
            <button onclick="getKfAccounts()">获取客服账号列表</button>
            <div id="accounts-result"></div>
        </div>
        
        <!-- 发送客服消息 -->
        <div class="section">
            <h3>💬 2. 发送客服消息</h3>
            <div class="form-group">
                <label>微信用户ID (external_userid):</label>
                <input type="text" id="touser" placeholder="用户的external_userid">
            </div>
            <div class="form-group">
                <label>客服账号ID (open_kfid):</label>
                <input type="text" id="open-kfid" placeholder="客服账号的open_kfid">
            </div>
            <div class="form-group">
                <label>消息类型:</label>
                <select id="msgtype" onchange="toggleMessageFields()">
                    <option value="text">文本消息</option>
                    <option value="image">图片消息</option>
                    <option value="link">图文链接</option>
                    <option value="location">地理位置</option>
                </select>
            </div>
            <div class="form-group" id="content-group">
                <label>消息内容:</label>
                <textarea id="content" rows="3" placeholder="输入消息内容"></textarea>
            </div>
            <div id="extra-fields"></div>
            <button onclick="sendKfMessage()">发送消息</button>
            <div id="send-result"></div>
        </div>
        
        <!-- 获取会话状态 -->
        <div class="section">
            <h3>📊 3. 获取会话状态</h3>
            <div class="form-group">
                <label>微信用户ID (external_userid):</label>
                <input type="text" id="state-userid" placeholder="用户的external_userid">
            </div>
            <div class="form-group">
                <label>客服账号ID (open_kfid):</label>
                <input type="text" id="state-kfid" placeholder="客服账号的open_kfid" value="kfca677d36885794305">
            </div>
            <button onclick="getServiceState()">获取会话状态</button>
            <div id="state-result"></div>
        </div>
        
        <!-- 变更会话状态 -->
        <div class="section">
            <h3>🔄 4. 变更会话状态</h3>
            <div class="form-group">
                <label>微信用户ID (external_userid):</label>
                <input type="text" id="trans-userid" placeholder="用户的external_userid">
            </div>
            <div class="form-group">
                <label>客服账号ID (open_kfid):</label>
                <input type="text" id="trans-kfid" placeholder="客服账号的open_kfid" value="kfca677d36885794305">
            </div>
            <div class="form-group">
                <label>目标状态:</label>
                <select id="service-state">
                    <option value="0">0 - 未处理</option>
                    <option value="1">1 - 由智能助手接待</option>
                    <option value="2">2 - 待接入池排队中</option>
                    <option value="3">3 - 由人工接待</option>
                    <option value="4">4 - 已结束/未开始</option>
                </select>
            </div>
            <div class="form-group">
                <label>接待人员ID (状态为3时必填):</label>
                <input type="text" id="servicer-userid" placeholder="接待人员的userid">
            </div>
            <button onclick="transServiceState()">变更会话状态</button>
            <div id="trans-result"></div>
        </div>
    </div>

    <script>
        function toggleMessageFields() {
            const msgtype = document.getElementById('msgtype').value;
            const extraFields = document.getElementById('extra-fields');
            const contentGroup = document.getElementById('content-group');
            
            contentGroup.style.display = msgtype === 'text' ? 'block' : 'none';
            
            let extraHtml = '';
            if (msgtype === 'image') {
                extraHtml = '<div class="form-group"><label>媒体ID:</label><input type="text" id="media-id" placeholder="图片文件的media_id"></div>';
            } else if (msgtype === 'link') {
                extraHtml = \`
                    <div class="form-group"><label>标题:</label><input type="text" id="link-title" placeholder="链接标题"></div>
                    <div class="form-group"><label>描述:</label><input type="text" id="link-desc" placeholder="链接描述"></div>
                    <div class="form-group"><label>链接URL:</label><input type="text" id="link-url" placeholder="http://example.com"></div>
                    <div class="form-group"><label>缩略图媒体ID:</label><input type="text" id="thumb-media-id" placeholder="缩略图的media_id"></div>
                \`;
            } else if (msgtype === 'location') {
                extraHtml = \`
                    <div class="form-group"><label>位置名称:</label><input type="text" id="location-name" placeholder="位置名称"></div>
                    <div class="form-group"><label>详细地址:</label><input type="text" id="location-address" placeholder="详细地址"></div>
                    <div class="form-group"><label>纬度:</label><input type="number" id="latitude" step="any" placeholder="纬度 (-90 to 90)"></div>
                    <div class="form-group"><label>经度:</label><input type="number" id="longitude" step="any" placeholder="经度 (-180 to 180)"></div>
                \`;
            }
            extraFields.innerHTML = extraHtml;
        }

        async function getKfAccounts() {
            try {
                const response = await fetch('/api/wechat/kf/account/list');
                const data = await response.json();
                document.getElementById('accounts-result').innerHTML = 
                    \`<div class="result"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('accounts-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function sendKfMessage() {
            const msgtype = document.getElementById('msgtype').value;
            const messageData = {
                touser: document.getElementById('touser').value,
                open_kfid: document.getElementById('open-kfid').value,
                msgtype: msgtype
            };

            if (msgtype === 'text') {
                messageData.content = document.getElementById('content').value;
            } else if (msgtype === 'image') {
                messageData.media_id = document.getElementById('media-id').value;
            } else if (msgtype === 'link') {
                messageData.title = document.getElementById('link-title').value;
                messageData.desc = document.getElementById('link-desc').value;
                messageData.url = document.getElementById('link-url').value;
                messageData.thumb_media_id = document.getElementById('thumb-media-id').value;
            } else if (msgtype === 'location') {
                messageData.name = document.getElementById('location-name').value;
                messageData.address = document.getElementById('location-address').value;
                messageData.latitude = parseFloat(document.getElementById('latitude').value);
                messageData.longitude = parseFloat(document.getElementById('longitude').value);
            }

            try {
                const response = await fetch('/api/wechat/kf/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(messageData)
                });
                const data = await response.json();
                document.getElementById('send-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('send-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function getServiceState() {
            const requestData = {
                external_userid: document.getElementById('state-userid').value,
                open_kfid: document.getElementById('state-kfid').value
            };

            try {
                const response = await fetch('/api/wechat/kf/service-state/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                });
                const data = await response.json();
                document.getElementById('state-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('state-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function transServiceState() {
            const requestData = {
                external_userid: document.getElementById('trans-userid').value,
                open_kfid: document.getElementById('trans-kfid').value,
                service_state: parseInt(document.getElementById('service-state').value)
            };

            const servicerUserid = document.getElementById('servicer-userid').value;
            if (servicerUserid) {
                requestData.servicer_userid = servicerUserid;
            }

            try {
                const response = await fetch('/api/wechat/kf/service-state/trans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                });
                const data = await response.json();
                document.getElementById('trans-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('trans-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }
    </script>
</body>
</html>
  `;
  
  res.send(html);
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

// 检查服务器IP地址
router.get('/check-ip', async (req, res) => {
  try {
    // 通过外部服务获取服务器出站IP
    const fetch = require('node-fetch');
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

// === 客服账号管理 ===

// 新增客服账号
router.post('/kf/account/add', async (req, res) => {
  try {
    const { name, media_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: '参数不完整', required: 'name' });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 调用创建接口
    const addResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/add?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(media_id ? { name, media_id } : { name })
    });

    const addData = await addResponse.json();

    if (addData.errcode === 0) {
      res.json({ success: true, message: '客服账号创建成功', open_kfid: addData.open_kfid, details: addData });
    } else {
      res.status(400).json({ error: '客服账号创建失败', details: addData });
    }
  } catch (error) {
    console.error('创建客服账号失败:', error);
    res.status(500).json({ error: '创建客服账号失败', message: error.message });
  }
});

// 更新客服账号名称
router.post('/kf/account/update', async (req, res) => {
  try {
    const { open_kfid, name } = req.body;

    if (!open_kfid || !name) {
      return res.status(400).json({ error: '参数不完整', required: 'open_kfid, name' });
    }

    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    const updateResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/update?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, open_kfid })
    });

    const updateData = await updateResponse.json();

    if (updateData.errcode === 0) {
      res.json({ success: true, message: '客服账号更新成功', details: updateData });
    } else {
      res.status(400).json({ error: '客服账号更新失败', details: updateData });
    }
  } catch (error) {
    console.error('更新客服账号失败:', error);
    res.status(500).json({ error: '更新客服账号失败', message: error.message });
  }
});

// 删除客服账号
router.post('/kf/account/del', async (req, res) => {
  try {
    const { open_kfid } = req.body;

    if (!open_kfid) {
      return res.status(400).json({ error: '参数不完整', required: 'open_kfid' });
    }

    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    const delResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/del?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_kfid })
    });

    const delData = await delResponse.json();

    if (delData.errcode === 0) {
      res.json({ success: true, message: '客服账号删除成功', details: delData });
    } else {
      res.status(400).json({ error: '客服账号删除失败', details: delData });
    }
  } catch (error) {
    console.error('删除客服账号失败:', error);
    res.status(500).json({ error: '删除客服账号失败', message: error.message });
  }
});

// 邀请绑定客服人员
router.post('/kf/account/invite', async (req, res) => {
  try {
    const { open_kfid, wxid } = req.body;

    if (!open_kfid || !wxid) {
      return res.status(400).json({ error: '参数不完整', required: 'open_kfid, wxid' });
    }

    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    const inviteResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/bind?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_kfid, wxid })
    });

    const inviteData = await inviteResponse.json();

    if (inviteData.errcode === 0) {
      res.json({ success: true, message: '邀请发送成功', details: inviteData });
    } else {
      res.status(400).json({ error: '邀请失败', details: inviteData });
    }
  } catch (error) {
    console.error('邀请绑定客服人员失败:', error);
    res.status(500).json({ error: '邀请绑定客服人员失败', message: error.message });
  }
});

// 上传客服账号头像
router.post('/kf/account/upload-avatar', async (req, res) => {
  try {
    const { open_kfid, avatar_url } = req.body;

    if (!open_kfid || !avatar_url) {
      return res.status(400).json({ error: '参数不完整', required: 'open_kfid, avatar_url' });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 企业微信官方接口目前需要上传文件，此处根据官方文档支持通过 URL 设置头像
    const uploadResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/account/uploadheadimg?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ open_kfid, avatar_url })
    });

    const uploadData = await uploadResponse.json();

    if (uploadData.errcode === 0) {
      res.json({ success: true, message: '头像设置成功', details: uploadData });
    } else {
      res.status(400).json({ error: '头像设置失败', details: uploadData });
    }
  } catch (error) {
    console.error('上传客服头像失败:', error);
    res.status(500).json({ error: '上传客服头像失败', message: error.message });
  }
});

// === 接待人员管理 ===

// 添加接待人员
router.post('/kf/servicer/add', async (req, res) => {
  try {
    const { open_kfid, userid_list, department_id_list } = req.body;

    if (!open_kfid || (!userid_list && !department_id_list)) {
      return res.status(400).json({ 
        error: '参数不完整', 
        required: 'open_kfid 和至少一个 userid_list 或 department_id_list' 
      });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 构建请求体
    const requestBody = { open_kfid };
    if (userid_list && userid_list.length > 0) {
      requestBody.userid_list = userid_list;
    }
    if (department_id_list && department_id_list.length > 0) {
      requestBody.department_id_list = department_id_list;
    }

    // 调用添加接待人员接口
    const addResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/add?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const addData = await addResponse.json();

    if (addData.errcode === 0) {
      res.json({ 
        success: true, 
        message: '接待人员添加成功', 
        result_list: addData.result_list,
        details: addData 
      });
    } else {
      res.status(400).json({ error: '接待人员添加失败', details: addData });
    }
  } catch (error) {
    console.error('添加接待人员失败:', error);
    res.status(500).json({ error: '添加接待人员失败', message: error.message });
  }
});

// 删除接待人员
router.post('/kf/servicer/del', async (req, res) => {
  try {
    const { open_kfid, userid_list, department_id_list } = req.body;

    if (!open_kfid || (!userid_list && !department_id_list)) {
      return res.status(400).json({ 
        error: '参数不完整', 
        required: 'open_kfid 和至少一个 userid_list 或 department_id_list' 
      });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 构建请求体
    const requestBody = { open_kfid };
    if (userid_list && userid_list.length > 0) {
      requestBody.userid_list = userid_list;
    }
    if (department_id_list && department_id_list.length > 0) {
      requestBody.department_id_list = department_id_list;
    }

    // 调用删除接待人员接口
    const delResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/del?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const delData = await delResponse.json();

    if (delData.errcode === 0) {
      res.json({ 
        success: true, 
        message: '接待人员删除成功', 
        result_list: delData.result_list,
        details: delData 
      });
    } else {
      res.status(400).json({ error: '接待人员删除失败', details: delData });
    }
  } catch (error) {
    console.error('删除接待人员失败:', error);
    res.status(500).json({ error: '删除接待人员失败', message: error.message });
  }
});

// 获取接待人员列表
router.get('/kf/servicer/list', async (req, res) => {
  try {
    const { open_kfid } = req.query;

    if (!open_kfid) {
      return res.status(400).json({ error: '参数不完整', required: 'open_kfid' });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 获取接待人员列表
    const listResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/servicer/list?access_token=${tokenData.access_token}&open_kfid=${open_kfid}`);
    const listData = await listResponse.json();

    if (listData.errcode === 0) {
      res.json({
        success: true,
        servicer_list: listData.servicer_list || [],
        total: listData.servicer_list ? listData.servicer_list.length : 0,
        details: listData
      });
    } else {
      res.status(400).json({ error: '获取接待人员列表失败', details: listData });
    }
  } catch (error) {
    console.error('获取接待人员列表失败:', error);
    res.status(500).json({ error: '获取接待人员列表失败', message: error.message });
  }
});

// === 消息同步和读取 ===

// 同步读取消息
router.post('/kf/sync-msg', async (req, res) => {
  try {
    const { cursor, token, limit = 1000, voice_format = 0, open_kfid } = req.body;

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 构建同步消息请求
    const syncRequest = {
      limit: Math.min(limit, 1000), // 最大值1000
      voice_format
    };

    // 可选参数
    if (cursor) syncRequest.cursor = cursor;
    if (token) syncRequest.token = token;
    if (open_kfid) syncRequest.open_kfid = open_kfid;

    // 调用同步消息接口
    const syncResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/sync_msg?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncRequest)
    });

    const syncData = await syncResponse.json();

    if (syncData.errcode === 0) {
      res.json({
        success: true,
        next_cursor: syncData.next_cursor,
        has_more: syncData.has_more,
        msg_list: syncData.msg_list || [],
        total_count: syncData.msg_list ? syncData.msg_list.length : 0,
        details: syncData
      });
    } else {
      res.status(400).json({ error: '同步消息失败', details: syncData });
    }
  } catch (error) {
    console.error('同步消息失败:', error);
    res.status(500).json({ error: '同步消息失败', message: error.message });
  }
});

// 发送事件响应消息（欢迎语、结束语等）
router.post('/kf/send-event-msg', async (req, res) => {
  try {
    const { code, msgtype, ...msgContent } = req.body;

    if (!code || !msgtype) {
      return res.status(400).json({ 
        error: '参数不完整', 
        required: 'code, msgtype' 
      });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 构建消息体
    const messageBody = {
      code,
      msgtype
    };

    // 根据消息类型构建不同的消息内容
    switch (msgtype) {
      case 'text':
        if (!msgContent.content) {
          return res.status(400).json({ error: '文本消息需要content参数' });
        }
        messageBody.text = { content: msgContent.content };
        break;
        
      case 'image':
        if (!msgContent.media_id) {
          return res.status(400).json({ error: '图片消息需要media_id参数' });
        }
        messageBody.image = { media_id: msgContent.media_id };
        break;
        
      case 'voice':
        if (!msgContent.media_id) {
          return res.status(400).json({ error: '语音消息需要media_id参数' });
        }
        messageBody.voice = { media_id: msgContent.media_id };
        break;
        
      case 'video':
        if (!msgContent.media_id) {
          return res.status(400).json({ error: '视频消息需要media_id参数' });
        }
        messageBody.video = { media_id: msgContent.media_id };
        break;
        
      case 'file':
        if (!msgContent.media_id) {
          return res.status(400).json({ error: '文件消息需要media_id参数' });
        }
        messageBody.file = { media_id: msgContent.media_id };
        break;
        
      case 'msgmenu':
        if (!msgContent.list || !Array.isArray(msgContent.list)) {
          return res.status(400).json({ error: '菜单消息需要list参数（数组）' });
        }
        messageBody.msgmenu = {
          head_content: msgContent.head_content || '',
          list: msgContent.list,
          tail_content: msgContent.tail_content || ''
        };
        break;
        
      default:
        return res.status(400).json({ 
          error: '不支持的消息类型', 
          supported: ['text', 'image', 'voice', 'video', 'file', 'msgmenu']
        });
    }

    // 发送事件响应消息
    const sendResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/send_msg_on_event?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messageBody)
    });

    const sendData = await sendResponse.json();

    if (sendData.errcode === 0) {
      res.json({
        success: true,
        message: '事件响应消息发送成功',
        msgid: sendData.msgid,
        details: sendData
      });
    } else {
      res.status(400).json({ 
        error: '事件响应消息发送失败', 
        details: sendData 
      });
    }
  } catch (error) {
    console.error('发送事件响应消息失败:', error);
    res.status(500).json({ error: '发送事件响应消息失败', message: error.message });
  }
});

// 获取客户基础信息
router.get('/kf/customer/info', async (req, res) => {
  try {
    const { external_userid, need_enter_session_context = 0 } = req.query;

    if (!external_userid) {
      return res.status(400).json({ error: '参数不完整', required: 'external_userid' });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 获取客户基础信息
    const infoResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/customer/batchget?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        external_userid_list: [external_userid],
        need_enter_session_context: parseInt(need_enter_session_context)
      })
    });

    const infoData = await infoResponse.json();

    if (infoData.errcode === 0) {
      const customerInfo = infoData.customer_list && infoData.customer_list.length > 0 
        ? infoData.customer_list[0] 
        : null;

      res.json({
        success: true,
        customer_info: customerInfo,
        details: infoData
      });
    } else {
      res.status(400).json({ error: '获取客户信息失败', details: infoData });
    }
  } catch (error) {
    console.error('获取客户信息失败:', error);
    res.status(500).json({ error: '获取客户信息失败', message: error.message });
  }
});

// 获取客服账号链接（用于生成专属的客服链接）
router.get('/kf/account/link', async (req, res) => {
  try {
    const { open_kfid, scene = '' } = req.query;

    if (!open_kfid) {
      return res.status(400).json({ error: '参数不完整', required: 'open_kfid' });
    }

    // 获取客服 access_token
    const tokenResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/token?corpid=${WECHAT_CONFIG.corpId}&corpsecret=${WECHAT_CONFIG.corpSecret}`);
    const tokenData = await tokenResponse.json();

    if (tokenData.errcode !== 0) {
      return res.status(400).json({ error: '获取客服access_token失败', details: tokenData });
    }

    // 获取客服账号链接
    const linkResponse = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/kf/add_contact_way?access_token=${tokenData.access_token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        open_kfid,
        scene
      })
    });

    const linkData = await linkResponse.json();

    if (linkData.errcode === 0) {
      res.json({
        success: true,
        url: linkData.url,
        details: linkData
      });
    } else {
      res.status(400).json({ error: '获取客服账号链接失败', details: linkData });
    }
  } catch (error) {
    console.error('获取客服账号链接失败:', error);
    res.status(500).json({ error: '获取客服账号链接失败', message: error.message });
  }
});

// === 客服完整测试页面 ===
router.get('/kf/test-complete', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>企业微信客服完整功能测试</title>
    <style>
        body { font-family: 'Microsoft YaHei', sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
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
        .row { display: flex; gap: 20px; }
        .col { flex: 1; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 企业微信客服完整功能测试</h1>
        
        <!-- 客服账号管理 -->
        <div class="section">
            <h3>📋 1. 客服账号管理</h3>
            <div class="row">
                <div class="col">
                    <h4>获取客服账号列表</h4>
                    <button onclick="getKfAccounts()">获取客服账号列表</button>
                    <div id="accounts-result"></div>
                </div>
                <div class="col">
                    <h4>创建客服账号</h4>
                    <div class="form-group">
                        <label>客服账号名称:</label>
                        <input type="text" id="account-name" placeholder="客服名称">
                    </div>
                    <button onclick="addKfAccount()">创建客服账号</button>
                    <div id="add-account-result"></div>
                </div>
            </div>
        </div>

        <!-- 接待人员管理 -->
        <div class="section">
            <h3>👨‍💼 2. 接待人员管理</h3>
            <div class="row">
                <div class="col">
                    <h4>添加接待人员</h4>
                    <div class="form-group">
                        <label>客服账号ID (open_kfid):</label>
                        <input type="text" id="servicer-kfid" placeholder="客服账号的open_kfid" value="kfca677d36885794305">
                    </div>
                    <div class="form-group">
                        <label>员工ID列表 (用逗号分隔):</label>
                        <input type="text" id="servicer-userids" placeholder="如: zhangsan,lisi">
                    </div>
                    <button onclick="addServicer()">添加接待人员</button>
                    <div id="servicer-add-result"></div>
                </div>
                <div class="col">
                    <h4>获取接待人员列表</h4>
                    <div class="form-group">
                        <label>客服账号ID (open_kfid):</label>
                        <input type="text" id="list-kfid" placeholder="客服账号的open_kfid" value="kfca677d36885794305">
                    </div>
                    <button onclick="getServicerList()">获取接待人员列表</button>
                    <div id="servicer-list-result"></div>
                </div>
            </div>
        </div>

        <!-- 消息同步与发送 -->
        <div class="section">
            <h3>💬 3. 消息同步与发送</h3>
            <div class="row">
                <div class="col">
                    <h4>同步拉取消息</h4>
                    <div class="form-group">
                        <label>客服账号ID (open_kfid, 可选):</label>
                        <input type="text" id="sync-kfid" placeholder="指定客服账号" value="kfca677d36885794305">
                    </div>
                    <div class="form-group">
                        <label>拉取数量:</label>
                        <input type="number" id="sync-limit" value="100" min="1" max="1000">
                    </div>
                    <button onclick="syncMessages()">拉取消息</button>
                    <div id="sync-result"></div>
                </div>
                <div class="col">
                    <h4>发送客服消息</h4>
                    <div class="form-group">
                        <label>微信用户ID:</label>
                        <input type="text" id="msg-touser" placeholder="external_userid">
                    </div>
                    <div class="form-group">
                        <label>客服账号ID:</label>
                        <input type="text" id="msg-kfid" placeholder="open_kfid" value="kfca677d36885794305">
                    </div>
                    <div class="form-group">
                        <label>消息内容:</label>
                        <textarea id="msg-content" rows="3" placeholder="消息内容"></textarea>
                    </div>
                    <button onclick="sendKfMessage()">发送消息</button>
                    <div id="send-msg-result"></div>
                </div>
            </div>
        </div>

        <!-- 会话状态管理 -->
        <div class="section">
            <h3>📊 4. 会话状态管理</h3>
            <div class="row">
                <div class="col">
                    <h4>获取会话状态</h4>
                    <div class="form-group">
                        <label>微信用户ID:</label>
                        <input type="text" id="session-userid" placeholder="external_userid">
                    </div>
                    <div class="form-group">
                        <label>客服账号ID:</label>
                        <input type="text" id="session-kfid" placeholder="open_kfid" value="kfca677d36885794305">
                    </div>
                    <button onclick="getSessionState()">获取会话状态</button>
                    <div id="session-state-result"></div>
                </div>
                <div class="col">
                    <h4>变更会话状态</h4>
                    <div class="form-group">
                        <label>微信用户ID:</label>
                        <input type="text" id="trans-userid" placeholder="external_userid">
                    </div>
                    <div class="form-group">
                        <label>客服账号ID:</label>
                        <input type="text" id="trans-kfid" placeholder="open_kfid" value="kfca677d36885794305">
                    </div>
                    <div class="form-group">
                        <label>目标状态:</label>
                        <select id="trans-state">
                            <option value="0">0 - 未处理</option>
                            <option value="1">1 - 由智能助手接待</option>
                            <option value="2">2 - 待接入池排队中</option>
                            <option value="3">3 - 由人工接待</option>
                            <option value="4">4 - 已结束/未开始</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>接待人员ID (状态为3时必填):</label>
                        <input type="text" id="trans-servicer" placeholder="接待人员的userid">
                    </div>
                    <button onclick="transSessionState()">变更会话状态</button>
                    <div id="trans-state-result"></div>
                </div>
            </div>
        </div>

        <!-- 客户信息 -->
        <div class="section">
            <h3>👤 5. 客户信息管理</h3>
            <div class="row">
                <div class="col">
                    <h4>获取客户基础信息</h4>
                    <div class="form-group">
                        <label>微信用户ID:</label>
                        <input type="text" id="customer-userid" placeholder="external_userid">
                    </div>
                    <button onclick="getCustomerInfo()">获取客户信息</button>
                    <div id="customer-info-result"></div>
                </div>
                <div class="col">
                    <h4>获取客服账号链接</h4>
                    <div class="form-group">
                        <label>客服账号ID:</label>
                        <input type="text" id="link-kfid" placeholder="open_kfid" value="kfca677d36885794305">
                    </div>
                    <div class="form-group">
                        <label>场景值 (可选):</label>
                        <input type="text" id="link-scene" placeholder="自定义场景值">
                    </div>
                    <button onclick="getKfLink()">获取客服链接</button>
                    <div id="link-result"></div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // 客服账号管理
        async function getKfAccounts() {
            try {
                const response = await fetch('/api/wechat/kf/account/list');
                const data = await response.json();
                document.getElementById('accounts-result').innerHTML = 
                    \`<div class="result"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('accounts-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function addKfAccount() {
            const name = document.getElementById('account-name').value;
            if (!name) {
                alert('请输入客服账号名称');
                return;
            }

            try {
                const response = await fetch('/api/wechat/kf/account/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
                const data = await response.json();
                document.getElementById('add-account-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('add-account-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        // 接待人员管理
        async function addServicer() {
            const open_kfid = document.getElementById('servicer-kfid').value;
            const userids = document.getElementById('servicer-userids').value;
            
            if (!open_kfid || !userids) {
                alert('请填写客服账号ID和员工ID');
                return;
            }

            const userid_list = userids.split(',').map(id => id.trim()).filter(id => id);

            try {
                const response = await fetch('/api/wechat/kf/servicer/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ open_kfid, userid_list })
                });
                const data = await response.json();
                document.getElementById('servicer-add-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('servicer-add-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function getServicerList() {
            const open_kfid = document.getElementById('list-kfid').value;
            if (!open_kfid) {
                alert('请输入客服账号ID');
                return;
            }

            try {
                const response = await fetch(\`/api/wechat/kf/servicer/list?open_kfid=\${open_kfid}\`);
                const data = await response.json();
                document.getElementById('servicer-list-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('servicer-list-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        // 消息同步
        async function syncMessages() {
            const open_kfid = document.getElementById('sync-kfid').value;
            const limit = parseInt(document.getElementById('sync-limit').value) || 100;
            
            const requestData = { limit };
            if (open_kfid) requestData.open_kfid = open_kfid;

            try {
                const response = await fetch('/api/wechat/kf/sync-msg', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                });
                const data = await response.json();
                document.getElementById('sync-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('sync-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function sendKfMessage() {
            const touser = document.getElementById('msg-touser').value;
            const open_kfid = document.getElementById('msg-kfid').value;
            const content = document.getElementById('msg-content').value;

            if (!touser || !open_kfid || !content) {
                alert('请填写完整信息');
                return;
            }

            try {
                const response = await fetch('/api/wechat/kf/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        touser, 
                        open_kfid, 
                        msgtype: 'text', 
                        content 
                    })
                });
                const data = await response.json();
                document.getElementById('send-msg-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('send-msg-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        // 会话状态
        async function getSessionState() {
            const external_userid = document.getElementById('session-userid').value;
            const open_kfid = document.getElementById('session-kfid').value;

            if (!external_userid || !open_kfid) {
                alert('请填写用户ID和客服账号ID');
                return;
            }

            try {
                const response = await fetch('/api/wechat/kf/service-state/get', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ external_userid, open_kfid })
                });
                const data = await response.json();
                document.getElementById('session-state-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('session-state-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function transSessionState() {
            const external_userid = document.getElementById('trans-userid').value;
            const open_kfid = document.getElementById('trans-kfid').value;
            const service_state = parseInt(document.getElementById('trans-state').value);
            const servicer_userid = document.getElementById('trans-servicer').value;

            if (!external_userid || !open_kfid) {
                alert('请填写用户ID和客服账号ID');
                return;
            }

            const requestData = { external_userid, open_kfid, service_state };
            if (servicer_userid) {
                requestData.servicer_userid = servicer_userid;
            }

            try {
                const response = await fetch('/api/wechat/kf/service-state/trans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                });
                const data = await response.json();
                document.getElementById('trans-state-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('trans-state-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        // 客户信息
        async function getCustomerInfo() {
            const external_userid = document.getElementById('customer-userid').value;
            if (!external_userid) {
                alert('请输入微信用户ID');
                return;
            }

            try {
                const response = await fetch(\`/api/wechat/kf/customer/info?external_userid=\${external_userid}\`);
                const data = await response.json();
                document.getElementById('customer-info-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('customer-info-result').innerHTML = 
                    \`<div class="result error">错误: \${error.message}</div>\`;
            }
        }

        async function getKfLink() {
            const open_kfid = document.getElementById('link-kfid').value;
            const scene = document.getElementById('link-scene').value;
            
            if (!open_kfid) {
                alert('请输入客服账号ID');
                return;
            }

            try {
                const url = \`/api/wechat/kf/account/link?open_kfid=\${open_kfid}\${scene ? '&scene=' + scene : ''}\`;
                const response = await fetch(url);
                const data = await response.json();
                document.getElementById('link-result').innerHTML = 
                    \`<div class="result \${data.success ? '' : 'error'}"><pre>\${JSON.stringify(data, null, 2)}</pre></div>\`;
            } catch (error) {
                document.getElementById('link-result').innerHTML = 
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
