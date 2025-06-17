const WeChatCrypto = require('./utils/wechat-crypto');
const { parseXML } = require('./utils/xml-parser');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    // 企业微信配置
    const WECHAT_TOKEN = process.env.WECHAT_TOKEN;
    const WECHAT_ENCODING_AES_KEY = process.env.WECHAT_ENCODING_AES_KEY;
    const WECHAT_CORP_ID = process.env.WECHAT_CORP_ID;

    if (!WECHAT_TOKEN || !WECHAT_ENCODING_AES_KEY || !WECHAT_CORP_ID) {
      console.error('企业微信配置缺失');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: '企业微信配置缺失' })
      };
    }

    const crypto = new WeChatCrypto(WECHAT_TOKEN, WECHAT_ENCODING_AES_KEY, WECHAT_CORP_ID);
    const query = event.queryStringParameters || {};

    // GET请求：验证URL
    if (event.httpMethod === 'GET') {
      const { msg_signature, timestamp, nonce, echostr } = query;
      
      console.log('验证URL请求:', { msg_signature, timestamp, nonce, echostr: echostr?.substring(0, 20) + '...' });

      if (!msg_signature || !timestamp || !nonce || !echostr) {
        return {
          statusCode: 400,
          headers,
          body: 'Missing required parameters'
        };
      }

      try {
        // 验证签名
        if (crypto.verifySignature(msg_signature, timestamp, nonce, echostr)) {
          // 解密echostr
          const decryptedEchostr = crypto.decrypt(echostr);
          console.log('URL验证成功');
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: decryptedEchostr
          };
        } else {
          console.error('签名验证失败');
          return {
            statusCode: 403,
            headers,
            body: 'Signature verification failed'
          };
        }
      } catch (error) {
        console.error('URL验证失败:', error);
        return {
          statusCode: 500,
          headers,
          body: 'Verification failed'
        };
      }
    }

    // POST请求：处理消息
    if (event.httpMethod === 'POST') {
      const { msg_signature, timestamp, nonce } = query;
      
      if (!msg_signature || !timestamp || !nonce) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '缺少必需参数' })
        };
      }

      try {
        // 解析XML消息
        const xmlData = await parseXML(event.body);
        const encryptedMsg = xmlData.xml.Encrypt[0];
        
        // 检查AgentID（如果有的话）
        const agentId = xmlData.xml.AgentID ? xmlData.xml.AgentID[0] : null;
        const TARGET_AGENT_ID = process.env.TARGET_AGENT_ID;
        
        if (TARGET_AGENT_ID && agentId && agentId !== TARGET_AGENT_ID) {
          console.log(`消息来自其他应用 AgentID: ${agentId}，跳过处理`);
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: 'success'
          };
        }
        
        // 验证签名
        if (!crypto.verifySignature(msg_signature, timestamp, nonce, encryptedMsg)) {
          console.error('消息签名验证失败');
          return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ error: '签名验证失败' })
          };
        }

        // 解密消息
        const decryptedMsg = crypto.decrypt(encryptedMsg);
        const msgData = await parseXML(decryptedMsg);
        
        console.log('收到企业微信消息:', JSON.stringify(msgData, null, 2));

        // 处理不同类型的消息
        const msgType = msgData.xml.MsgType[0];
        const fromUser = msgData.xml.FromUserName[0];
        const toUser = msgData.xml.ToUserName[0];
        
        // 指定要处理消息的客服账号ID（需要在环境变量中配置）
        const TARGET_CUSTOMER_SERVICE = process.env.TARGET_CUSTOMER_SERVICE || 'your_target_userid';
        
        // 只处理发送给指定客服的消息
        if (toUser !== TARGET_CUSTOMER_SERVICE) {
          console.log(`消息发送给了其他客服 ${toUser}，跳过处理`);
          return {
            statusCode: 200,
            headers: { 'Content-Type': 'text/plain' },
            body: 'success'
          };
        }
        
        console.log(`处理发送给目标客服 ${TARGET_CUSTOMER_SERVICE} 的消息`);

        if (msgType === 'text') {
          const content = msgData.xml.Content[0];
          console.log(`收到文本消息 - 用户: ${fromUser}, 内容: ${content}`);

          // 调用AI处理函数
          try {
            const aiResponse = await fetch(`${event.headers.host}/.netlify/functions/wechat-ai-handler`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                user_id: fromUser,
                user_name: fromUser,
                user_content: content
              })
            });

            const aiResult = await aiResponse.json();
            console.log('AI处理结果:', aiResult);

            // 构造回复消息
            const replyMsg = `✅ 已收到您的消息并处理完成！\n\n📝 创建的文档：${aiResult.document_title || '新文档'}\n🔗 文档链接：${aiResult.document_url || '处理中...'}`;
            
            // 加密回复消息
            const replyXml = `<xml>
              <ToUserName><![CDATA[${fromUser}]]></ToUserName>
              <FromUserName><![CDATA[${toUser}]]></FromUserName>
              <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
              <MsgType><![CDATA[text]]></MsgType>
              <Content><![CDATA[${replyMsg}]]></Content>
            </xml>`;

            const encryptedReply = crypto.encrypt(replyXml);
            const replyTimestamp = Math.floor(Date.now() / 1000).toString();
            const replyNonce = Math.random().toString(36).substring(2, 15);
            const replySignature = crypto.verifySignature('', replyTimestamp, replyNonce, encryptedReply);

            const responseXml = `<xml>
              <Encrypt><![CDATA[${encryptedReply}]]></Encrypt>
              <MsgSignature><![CDATA[${replySignature}]]></MsgSignature>
              <TimeStamp>${replyTimestamp}</TimeStamp>
              <Nonce><![CDATA[${replyNonce}]]></Nonce>
            </xml>`;

            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/xml' },
              body: responseXml
            };

          } catch (error) {
            console.error('AI处理失败:', error);
            // 返回错误消息
            const errorMsg = '抱歉，处理您的消息时出现了问题，请稍后重试。';
            const errorXml = `<xml>
              <ToUserName><![CDATA[${fromUser}]]></ToUserName>
              <FromUserName><![CDATA[${toUser}]]></FromUserName>
              <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
              <MsgType><![CDATA[text]]></MsgType>
              <Content><![CDATA[${errorMsg}]]></Content>
            </xml>`;

            const encryptedError = crypto.encrypt(errorXml);
            const errorTimestamp = Math.floor(Date.now() / 1000).toString();
            const errorNonce = Math.random().toString(36).substring(2, 15);
            const errorSignature = crypto.verifySignature('', errorTimestamp, errorNonce, encryptedError);

            const errorResponseXml = `<xml>
              <Encrypt><![CDATA[${encryptedError}]]></Encrypt>
              <MsgSignature><![CDATA[${errorSignature}]]></MsgSignature>
              <TimeStamp>${errorTimestamp}</TimeStamp>
              <Nonce><![CDATA[${errorNonce}]]></Nonce>
            </xml>`;

            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/xml' },
              body: errorResponseXml
            };
          }
        }

        // 其他类型消息暂时返回success
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/plain' },
          body: 'success'
        };

      } catch (error) {
        console.error('消息处理失败:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '消息处理失败' })
        };
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '不支持的请求方法' })
    };

  } catch (error) {
    console.error('企业微信回调处理失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '服务器内部错误',
        message: error.message 
      })
    };
  }
}; 
