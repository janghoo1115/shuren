const express = require('express');
const router = express.Router();
const WeChatCrypto = require('../utils/wechat-crypto');

// 企业微信配置
const WECHAT_CONFIG = {
  token: process.env.WECHAT_TOKEN,
  encodingAESKey: process.env.WECHAT_ENCODING_AES_KEY,
  corpId: process.env.WECHAT_CORP_ID,
  agentId: process.env.WECHAT_AGENT_ID,
  corpSecret: process.env.WECHAT_CORP_SECRET
};

// 创建加密工具实例
const crypto = new WeChatCrypto(
  WECHAT_CONFIG.token,
  WECHAT_CONFIG.encodingAESKey,
  WECHAT_CONFIG.corpId
);

// 微信回调处理
router.all('/callback', async (req, res) => {
  try {
    console.log('收到微信回调请求:', {
      method: req.method,
      query: req.query,
      headers: req.headers,
      body: req.body
    });

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
      if (typeof req.body === 'string') {
        // 处理XML格式
        const xmlMatch = req.body.match(/<Encrypt><!\[CDATA\[(.*?)\]\]><\/Encrypt>/);
        if (xmlMatch) {
          encryptedMsg = xmlMatch[1];
        } else {
          console.log('未找到加密消息体');
          return res.status(400).send('消息格式错误');
        }
      } else if (req.body && req.body.Encrypt) {
        encryptedMsg = req.body.Encrypt;
      } else {
        console.log('无法获取加密消息体');
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
    // 这里可以添加具体的消息处理逻辑
    // 比如解析XML，根据消息类型进行不同处理等
  } catch (error) {
    console.error('处理微信消息失败:', error);
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

module.exports = router; 
