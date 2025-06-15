const crypto = require('crypto');

/**
 * 飞书加解密工具类
 */
class FeishuCrypto {
  constructor(encryptKey) {
    this.encryptKey = encryptKey;
  }

  /**
   * AES-256-CBC 解密
   * @param {string} encryptedData - 加密的数据
   * @param {string} key - 解密密钥
   * @returns {string} 解密后的数据
   */
  decrypt(encryptedData, key) {
    try {
      const keyBuffer = Buffer.from(key + key.substring(0, 32 - key.length), 'utf8');
      const encryptedBuffer = Buffer.from(encryptedData, 'base64');
      
      const iv = encryptedBuffer.slice(0, 16);
      const encrypted = encryptedBuffer.slice(16);
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      console.error('解密失败:', error);
      throw new Error('解密失败');
    }
  }

  /**
   * AES-256-CBC 加密
   * @param {string} data - 要加密的数据
   * @param {string} key - 加密密钥
   * @returns {string} 加密后的数据
   */
  encrypt(data, key) {
    try {
      const keyBuffer = Buffer.from(key + key.substring(0, 32 - key.length), 'utf8');
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
      let encrypted = cipher.update(data, 'utf8');
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const result = Buffer.concat([iv, encrypted]);
      return result.toString('base64');
    } catch (error) {
      console.error('加密失败:', error);
      throw new Error('加密失败');
    }
  }

  /**
   * SHA-256 签名验证
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @param {string} encryptStr - 加密字符串
   * @param {string} signature - 签名
   * @returns {boolean} 验证结果
   */
  verifySignature(timestamp, nonce, encryptStr, signature) {
    try {
      const str = timestamp + nonce + this.encryptKey + encryptStr;
      const hash = crypto.createHash('sha256').update(str).digest('hex');
      return hash === signature;
    } catch (error) {
      console.error('签名验证失败:', error);
      return false;
    }
  }
}

module.exports = FeishuCrypto; 
