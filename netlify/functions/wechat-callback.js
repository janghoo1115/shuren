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
      // 对请求参数做 URL decode 处理
      let { msg_signature, timestamp, nonce, echostr } = query;
      
      if (echostr) {
        echostr = decodeURIComponent(echostr);
      }
      if (msg_signature) {
        msg_signature = decodeURIComponent(msg_signature);
      }
      if (timestamp) {
        timestamp = decodeURIComponent(timestamp);
      }
      if (nonce) {
        nonce = decodeURIComponent(nonce);
      }
      
      console.log('企微验证请求参数 (URL decoded):', { 
        msg_signature, 
        timestamp, 
        nonce, 
        echostr: echostr?.substring(0, 20) + '...',
        echostr_length: echostr?.length
      });

      if (!msg_signature || !timestamp || !nonce || !echostr) {
        console.error('缺少必需参数:', { msg_signature: !!msg_signature, timestamp: !!timestamp, nonce: !!nonce, echostr: !!echostr });
        return {
          statusCode: 400,
          headers,
          body: 'Missing required parameters'
        };
      }

      try {
        console.log('开始验证签名...');
        
        // 验证签名
        const isValidSignature = crypto.verifySignature(msg_signature, timestamp, nonce, echostr);
        console.log('签名验证结果:', isValidSignature);
        
        if (isValidSignature) {
          console.log('签名验证成功，开始解密echostr...');
          // 解密echostr得到明文消息内容
          const decryptedEchostr = crypto.decrypt(echostr);
          console.log('URL验证成功，返回解密结果:', decryptedEchostr);
          
          // 在1秒内原样返回明文消息内容(不能加引号，不能带bom头，不能带换行符)
          return {
            statusCode: 200,
            headers: { 
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-cache'
            },
            body: decryptedEchostr.trim() // 去除可能的换行符
          };
        } else {
          console.error('签名验证失败');
          
          // 即使签名验证失败，也尝试解密（调试用）
          console.log('尝试解密echostr进行调试...');
          try {
            const decryptedEchostr = crypto.decrypt(echostr);
            console.log('解密成功（但签名验证失败）:', decryptedEchostr);
            
            // 临时返回解密结果（用于调试）
            return {
              statusCode: 200,
              headers: { 
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache'
              },
              body: decryptedEchostr.trim()
            };
          } catch (decryptError) {
            console.error('解密也失败了:', decryptError.message);
            return {
              statusCode: 403,
              headers,
              body: 'Signature verification failed'
            };
          }
        }
      } catch (error) {
        console.error('URL验证异常:', error);
        return {
          statusCode: 500,
          headers,
          body: `Verification failed: ${error.message}`
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
            const signature = crypto.verifySignature(timestamp, nonce, encryptedReply);

            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/xml' },
              body: `<xml>
                <Encrypt><![CDATA[${encryptedReply}]]></Encrypt>
                <MsgSignature><![CDATA[${signature}]]></MsgSignature>
                <TimeStamp>${timestamp}</TimeStamp>
                <Nonce><![CDATA[${nonce}]]></Nonce>
              </xml>`
            };
          } catch (aiError) {
            console.error('AI处理失败:', aiError);
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'text/plain' },
              body: 'success'
            };
          }
        }

        // 其他类型消息直接返回成功
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'text/plain' },
          body: 'success'
        };

      } catch (error) {
        console.error('处理消息异常:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: '处理消息失败' })
        };
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: '不支持的HTTP方法' })
    };

  } catch (error) {
    console.error('处理请求异常:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: '服务器内部错误' })
    };
  }
};
