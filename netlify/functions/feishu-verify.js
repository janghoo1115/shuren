const FeishuCrypto = require('./utils/crypto');

/**
 * 飞书URL验证函数
 * 用于验证飞书回调URL的有效性
 */
exports.handler = async (event, context) => {
  console.log('收到飞书验证请求:', event);

  // 设置CORS头
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理OPTIONS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // 获取环境变量
    const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
    const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;

    if (!encryptKey || !verificationToken) {
      console.error('缺少必要的环境变量');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '服务配置错误' })
      };
    }

    // 解析请求体
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      console.error('请求体解析失败:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '请求格式错误' })
      };
    }

    const { encrypt, timestamp, nonce, signature } = requestBody;

    // 验证必要参数
    if (!encrypt || !timestamp || !nonce || !signature) {
      console.error('缺少必要参数');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '缺少必要参数' })
      };
    }

    // 初始化加解密工具
    const crypto = new FeishuCrypto(encryptKey);

    // 验证签名
    const isValidSignature = crypto.verifySignature(timestamp, nonce, encrypt, signature);
    if (!isValidSignature) {
      console.error('签名验证失败');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: '签名验证失败' })
      };
    }

    // 解密数据
    let decryptedData;
    try {
      decryptedData = crypto.decrypt(encrypt, encryptKey);
      console.log('解密成功:', decryptedData);
    } catch (error) {
      console.error('解密失败:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '数据解密失败' })
      };
    }

    // 解析解密后的数据
    let eventData;
    try {
      eventData = JSON.parse(decryptedData);
    } catch (error) {
      console.error('解密数据解析失败:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '解密数据格式错误' })
      };
    }

    // 处理URL验证挑战
    if (eventData.type === 'url_verification') {
      const challenge = eventData.challenge;
      console.log('URL验证挑战:', challenge);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ challenge })
      };
    }

    // 验证token
    if (eventData.token !== verificationToken) {
      console.error('Token验证失败');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Token验证失败' })
      };
    }

    console.log('验证成功，事件数据:', eventData);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: '验证成功' })
    };

  } catch (error) {
    console.error('处理请求时发生错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '服务器内部错误' })
    };
  }
}; 