const crypto = require('crypto');

/**
 * 企业微信消息加解密工具类
 */
class WeChatCrypto {
  constructor(token, encodingAESKey, corpId) {
    this.token = token;
    this.encodingAESKey = encodingAESKey;
    this.corpId = corpId;
    this.key = Buffer.from(encodingAESKey + '=', 'base64');
  }

  /**
   * 验证签名
   */
  verifySignature(signature, timestamp, nonce, echostr = '') {
    const tmpArr = [this.token, timestamp, nonce, echostr].sort();
    const tmpStr = tmpArr.join('');
    const hash = crypto.createHash('sha1').update(tmpStr).digest('hex');
    return hash === signature;
  }

  /**
   * 解密消息
   */
  decrypt(encryptedMsg) {
    try {
      const cipher = Buffer.from(encryptedMsg, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, cipher.slice(0, 16));
      decipher.setAutoPadding(false);
      
      let decrypted = Buffer.concat([decipher.update(cipher.slice(16)), decipher.final()]);
      
      // 去除填充
      const pad = decrypted[decrypted.length - 1];
      decrypted = decrypted.slice(0, decrypted.length - pad);
      
      // 提取消息内容
      const msgLen = decrypted.readUInt32BE(16);
      const msg = decrypted.slice(20, 20 + msgLen).toString();
      const receivedCorpId = decrypted.slice(20 + msgLen).toString();
      
      if (receivedCorpId !== this.corpId) {
        throw new Error('CorpId不匹配');
      }
      
      return msg;
    } catch (error) {
      console.error('解密失败:', error);
      throw error;
    }
  }

  /**
   * 加密消息
   */
  encrypt(msg) {
    try {
      const random = crypto.randomBytes(16);
      const msgBuffer = Buffer.from(msg);
      const msgLen = Buffer.alloc(4);
      msgLen.writeUInt32BE(msgBuffer.length, 0);
      const corpIdBuffer = Buffer.from(this.corpId);
      
      const content = Buffer.concat([random, msgLen, msgBuffer, corpIdBuffer]);
      
      // 添加PKCS7填充
      const blockSize = 32;
      const padLen = blockSize - (content.length % blockSize);
      const padBuffer = Buffer.alloc(padLen, padLen);
      const paddedContent = Buffer.concat([content, padBuffer]);
      
      const iv = this.key.slice(0, 16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
      cipher.setAutoPadding(false);
      
      const encrypted = Buffer.concat([cipher.update(paddedContent), cipher.final()]);
      return Buffer.concat([iv, encrypted]).toString('base64');
    } catch (error) {
      console.error('加密失败:', error);
      throw error;
    }
  }
}

module.exports = WeChatCrypto; 
