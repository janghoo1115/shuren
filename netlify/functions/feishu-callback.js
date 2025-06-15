const FeishuCrypto = require('./utils/crypto');

/**
 * 飞书事件回调处理函数
 * 用于处理消息、应用安装等各种飞书事件
 */
exports.handler = async (event, context) => {
  console.log('收到飞书回调请求:', event);

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
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;

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
      console.log('解析的请求体:', requestBody);  // 添加日志
    } catch (error) {
      console.error('请求体解析失败:', error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: '请求格式错误' })
      };
    }

    // 处理 URL 验证请求
    if (requestBody.type === 'url_verification') {
      console.log('收到URL验证请求');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ challenge: requestBody.challenge })
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

    // 验证token
    if (eventData.token !== verificationToken) {
      console.error('Token验证失败');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Token验证失败' })
      };
    }

    console.log('收到事件:', eventData);

    // 根据事件类型处理不同的回调
    switch (eventData.type) {
      case 'im.message.receive_v1':
        return await handleMessageReceive(eventData, headers);
      
      case 'application.app_uninstalled':
        return await handleAppUninstalled(eventData, headers);
      
      case 'application.app_open':
        return await handleAppOpen(eventData, headers);
      
      default:
        console.log('未知事件类型:', eventData.type);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: '事件已收到' })
        };
    }

  } catch (error) {
    console.error('处理回调时发生错误:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '服务器内部错误' })
    };
  }
};

/**
 * 处理接收消息事件
 */
async function handleMessageReceive(eventData, headers) {
  try {
    const { event } = eventData;
    const { sender, message } = event;
    
    console.log('收到消息:', {
      发送者: sender,
      消息内容: message.content,
      消息类型: message.message_type
    });

    // 这里可以添加具体的消息处理逻辑
    // 例如：自动回复、消息转发、AI处理等
    
    // 示例：简单的自动回复逻辑
    if (message.message_type === 'text') {
      const textContent = JSON.parse(message.content);
      const userText = textContent.text;
      
      // 这里可以调用AI接口或其他业务逻辑
      console.log('用户发送的文本:', userText);
      
      // 可以在这里添加回复逻辑
      // await sendReplyMessage(sender, '收到您的消息：' + userText);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: '消息处理成功' })
    };
    
  } catch (error) {
    console.error('处理消息事件失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '消息处理失败' })
    };
  }
}

/**
 * 处理应用卸载事件
 */
async function handleAppUninstalled(eventData, headers) {
  try {
    const { event } = eventData;
    console.log('应用被卸载:', event);
    
    // 这里可以添加应用卸载后的清理逻辑
    // 例如：清理用户数据、记录卸载日志等
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: '卸载事件处理成功' })
    };
    
  } catch (error) {
    console.error('处理卸载事件失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '卸载事件处理失败' })
    };
  }
}

/**
 * 处理应用打开事件
 */
async function handleAppOpen(eventData, headers) {
  try {
    const { event } = eventData;
    console.log('应用被打开:', event);
    
    // 这里可以添加应用打开后的逻辑
    // 例如：记录用户访问、发送欢迎消息等
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, message: '应用打开事件处理成功' })
    };
    
  } catch (error) {
    console.error('处理应用打开事件失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '应用打开事件处理失败' })
    };
  }
} 
