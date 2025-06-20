const express = require('express');
const router = express.Router();

// 飞书配置
const FEISHU_CONFIG = {
  appId: process.env.FEISHU_APP_ID,
  appSecret: process.env.FEISHU_APP_SECRET,
  redirectUri: process.env.FEISHU_REDIRECT_URI || 'https://backend.shurenai.xyz/api/feishu/callback'
};

// 飞书OAuth验证页面
router.get('/verify', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${FEISHU_CONFIG.appId}&redirect_uri=${encodeURIComponent(FEISHU_CONFIG.redirectUri)}&scope=drive:drive&state=${state}`;
  
  res.send(`
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>数刃AI - 飞书授权</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Arial, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                color: #333;
            }
            .container {
                background: white;
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 400px;
                width: 90%;
            }
            .title {
                font-size: 28px;
                font-weight: 600;
                color: #1d1d1f;
                margin-bottom: 20px;
            }
            .subtitle {
                font-size: 16px;
                color: #666;
                margin-bottom: 30px;
                line-height: 1.5;
            }
            .auth-btn {
                background: #007AFF;
                color: white;
                border: none;
                border-radius: 12px;
                padding: 16px 32px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                text-decoration: none;
                display: inline-block;
                transition: all 0.3s ease;
            }
            .auth-btn:hover {
                background: #0056CC;
                transform: translateY(-2px);
                box-shadow: 0 10px 20px rgba(0, 122, 255, 0.3);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1 class="title">数刃AI</h1>
            <p class="subtitle">授权飞书访问权限，自动为您创建文档</p>
            <div style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; font-size: 14px; color: #666;">
                <p>🔒 安全提示：此服务将跳转到飞书官方授权页面</p>
                <p>📱 如遇微信安全提示，请选择"继续访问"</p>
            </div>
            <a href="${authUrl}" class="auth-btn">授权飞书账户</a>
        </div>
    </body>
    </html>
  `);
});

// 飞书OAuth回调处理
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code) {
      return res.status(400).send('授权失败：缺少授权码');
    }

    console.log('收到飞书回调，授权码:', code);

    // 获取用户访问令牌
    const tokenResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAppToken()}`
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code
      })
    });

    const tokenData = await tokenResponse.json();
    console.log('令牌响应:', tokenData);

    if (tokenData.code !== 0) {
      return res.status(400).json({ error: '获取访问令牌失败', details: tokenData });
    }

    const accessToken = tokenData.data.access_token;

    // 创建文档
    const docResponse = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        title: "微信随心记"
      })
    });

    const docData = await docResponse.json();
    console.log('文档创建响应:', docData);

    if (docData.code !== 0) {
      return res.status(400).json({ error: '创建文档失败', details: docData });
    }

    const docId = docData.data.document.document_id;

    // 不添加任何内容，保持文档为空

    // 返回成功页面
    res.send(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>数刃AI - 授权成功</title>
          <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Arial, sans-serif;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  min-height: 100vh;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  color: #333;
              }
              .container {
                  background: white;
                  border-radius: 20px;
                  padding: 40px;
                  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
                  text-align: center;
                  max-width: 400px;
                  width: 90%;
              }
              .success-icon {
                  width: 60px;
                  height: 60px;
                  margin: 0 auto 20px;
                  background: #34C759;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-size: 30px;
                  color: white;
              }
              .title {
                  font-size: 24px;
                  font-weight: 600;
                  color: #1d1d1f;
                  margin-bottom: 15px;
              }
              .subtitle {
                  font-size: 16px;
                  color: #666;
                  margin-bottom: 20px;
                  line-height: 1.5;
              }
              .doc-link {
                  background: #007AFF;
                  color: white;
                  border: none;
                  border-radius: 12px;
                  padding: 12px 24px;
                  font-size: 14px;
                  font-weight: 600;
                  cursor: pointer;
                  text-decoration: none;
                  display: inline-block;
                  transition: all 0.3s ease;
                  margin-top: 10px;
              }
              .doc-link:hover {
                  background: #0056CC;
                  transform: translateY(-2px);
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="success-icon">✓</div>
                             <h1 class="title">授权成功！</h1>
               <p class="subtitle">"微信随心记"文档已在您的飞书中自动创建<br/>文档ID: ${docId}</p>
              <a href="https://feishu.cn" target="_blank" class="doc-link">前往飞书查看</a>
          </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('飞书回调处理失败:', error);
    res.status(500).send(`授权失败: ${error.message}`);
  }
});

// 自动验证（一键授权）
router.get('/auto-verify', (req, res) => {
  const state = Math.random().toString(36).substring(7);
  const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${FEISHU_CONFIG.appId}&redirect_uri=${encodeURIComponent(FEISHU_CONFIG.redirectUri)}&scope=drive:drive&state=${state}`;
  
  res.redirect(authUrl);
});

// auto-create路由已删除，统一使用callback处理

// 获取应用访问令牌
async function getAppToken() {
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: FEISHU_CONFIG.appId,
        app_secret: FEISHU_CONFIG.appSecret
      })
    });

    const data = await response.json();
    if (data.code !== 0) {
      throw new Error(`获取应用令牌失败: ${data.msg}`);
    }

    return data.app_access_token;
  } catch (error) {
    console.error('获取应用令牌失败:', error);
    throw error;
  }
}

module.exports = router; 
