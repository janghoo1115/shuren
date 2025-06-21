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
   * 验证签名 - 企业微信官方规范
   * msg_signature结合了企业填写的token、请求中的timestamp、nonce参数、加密的消息体
   */
  verifySignature(signature, timestamp, nonce, encrypt = '') {
    const tmpArr = [this.token, timestamp, nonce, encrypt].sort();
    const tmpStr = tmpArr.join('');
    const hash = crypto.createHash('sha1').update(tmpStr).digest('hex');
    console.log('签名验证详情:', {
      token: this.token,
      timestamp,
      nonce,
      encrypt_length: encrypt.length,
      sorted_array: tmpArr,
      joined_string: tmpStr,
      calculated_hash: hash,
      expected_signature: signature,
      match: hash === signature
    });
    return hash === signature;
  }

  /**
   * 生成签名 - 用于被动回复
   */
  generateSignature(timestamp, nonce, encrypt) {
    const tmpArr = [this.token, timestamp, nonce, encrypt].sort();
    const tmpStr = tmpArr.join('');
    const hash = crypto.createHash('sha1').update(tmpStr).digest('hex');
    console.log('生成签名详情:', {
      token: this.token,
      timestamp,
      nonce,
      encrypt_length: encrypt.length,
      sorted_array: tmpArr,
      joined_string: tmpStr,
      generated_hash: hash
    });
    return hash;
  }

  /**
   * 解密消息 - 按照企业微信官方规范
   * 格式：random(16字节) + msg_len(4字节) + msg + $CorpId
   */
  decrypt(encryptedMsg) {
    try {
      console.log('开始解密，原始数据长度:', encryptedMsg.length);
      
      // Base64解码
      const encryptedData = Buffer.from(encryptedMsg, 'base64');
      console.log('Base64解码后长度:', encryptedData.length);
      
      if (encryptedData.length < 32) { // 至少需要32字节（16字节IV + 16字节最小数据）
        throw new Error('加密数据长度不足');
      }
      
      // 使用AES-256-CBC解密，IV为key的前16字节
      const iv = this.key.slice(0, 16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
      decipher.setAutoPadding(false);
      
      let decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      console.log('解密后数据长度:', decrypted.length);
      
      if (decrypted.length === 0) {
        throw new Error('解密后数据为空');
      }
      
      // 去除PKCS7填充
      const pad = decrypted[decrypted.length - 1];
      console.log('填充字节值:', pad);
      
      if (pad > 0 && pad <= 32 && pad <= decrypted.length) {
        // 验证填充是否正确
        let validPadding = true;
        for (let i = decrypted.length - pad; i < decrypted.length; i++) {
          if (decrypted[i] !== pad) {
            validPadding = false;
            break;
          }
        }
        
        if (validPadding) {
          decrypted = decrypted.slice(0, decrypted.length - pad);
          console.log('去除填充后数据长度:', decrypted.length);
        } else {
          console.log('填充验证失败，保持原数据');
        }
      } else {
        console.log('填充值异常，保持原数据');
      }
      
      // 按照企微格式解析：random(16) + msg_len(4) + msg + corpId
      if (decrypted.length < 20) {
        console.log('数据长度不足20字节，无法解析');
        return decrypted.toString('utf8');
      }
      
      // 跳过前16字节的随机数
      const msgLenBuffer = decrypted.slice(16, 20);
      const msgLen = msgLenBuffer.readUInt32BE(0);
      console.log('消息长度:', msgLen);
      
      if (msgLen <= 0 || msgLen > decrypted.length - 20) {
        console.log('消息长度异常，尝试直接返回去除随机数后的内容');
        return decrypted.slice(16).toString('utf8');
      }
      
      // 提取消息内容
      const msg = decrypted.slice(20, 20 + msgLen).toString('utf8');
      console.log('提取的消息:', msg);
      
      // 提取CorpId（如果有的话）
      if (20 + msgLen < decrypted.length) {
        const receivedCorpId = decrypted.slice(20 + msgLen).toString('utf8');
        console.log('提取的CorpId:', receivedCorpId);
        
        if (receivedCorpId !== this.corpId) {
          console.log(`CorpId不匹配: 期望=${this.corpId}, 实际=${receivedCorpId}`);
        }
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
