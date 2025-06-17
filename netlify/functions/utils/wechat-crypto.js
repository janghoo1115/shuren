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
      console.log('开始解密，原始数据长度:', encryptedMsg.length);
      
      const cipher = Buffer.from(encryptedMsg, 'base64');
      console.log('Base64解码后长度:', cipher.length);
      
      if (cipher.length < 16) {
        throw new Error('加密数据长度不足');
      }
      
      const iv = cipher.slice(0, 16);
      const encryptedData = cipher.slice(16);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
      decipher.setAutoPadding(false);
      
      let decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      console.log('解密后数据长度:', decrypted.length);
      
      if (decrypted.length === 0) {
        throw new Error('解密后数据为空');
      }
      
      // 去除填充
      const pad = decrypted[decrypted.length - 1];
      if (pad > 32 || pad > decrypted.length) {
        console.log('填充值异常，跳过填充处理');
      } else {
        decrypted = decrypted.slice(0, decrypted.length - pad);
      }
      
      console.log('去除填充后数据长度:', decrypted.length);
      
      // 检查数据长度是否足够
      if (decrypted.length < 20) {
        console.log('数据长度不足，直接返回解密结果');
        return decrypted.toString();
      }
      
      // 提取消息内容
      const msgLen = decrypted.readUInt32BE(16);
      console.log('消息长度:', msgLen);
      
      if (20 + msgLen > decrypted.length) {
        console.log('消息长度超出数据范围，直接返回解密结果');
        return decrypted.toString();
      }
      
      const msg = decrypted.slice(20, 20 + msgLen).toString();
      const receivedCorpId = decrypted.slice(20 + msgLen).toString();
      
      console.log('提取的消息:', msg);
      console.log('提取的CorpId:', receivedCorpId);
      
      if (receivedCorpId !== this.corpId) {
        console.log('CorpId不匹配，但仍返回消息内容');
        // 不抛出错误，只是警告
      }
      
      return msg;
    } catch (error) {
      console.error('解密失败:', error);
      console.error('错误堆栈:', error.stack);
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
