/**
 * 飞书OAuth授权回调处理函数
 * 处理用户授权后的回调，获取访问令牌
 */
exports.handler = async (event, context) => {
  console.log('飞书授权回调请求:', event.httpMethod);
  console.log('查询参数:', event.queryStringParameters);

  // 设置CORS头
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'text/html; charset=utf-8'
  };

  // 处理OPTIONS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // 只处理GET请求
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: '方法不允许' })
    };
  }

  try {
    // 飞书应用配置 - 使用最新的正确配置
    const FEISHU_APP_ID = "cli_a8c3c35f5230d00e";
    const FEISHU_APP_SECRET = "bAbJhKTOnzLyBxHwbK2hkgkRPFsPTRgw";
    const FEISHU_REDIRECT_URI = "https://shurenai.xyz/.netlify/functions/feishu-callback";
    
    console.log('使用配置:', {
      app_id: FEISHU_APP_ID,
      app_secret: FEISHU_APP_SECRET.substring(0, 10) + '...',
      redirect_uri: FEISHU_REDIRECT_URI
    });

    // 获取查询参数
    const { code, state, error } = event.queryStringParameters || {};

    console.log('回调参数:', { code, state, error });

    // 检查是否有错误
    if (error) {
      const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>授权失败</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 4px; margin: 20px 0; }
          </style>
      </head>
      <body>
          <h1>❌ 授权失败</h1>
          <div class="error">错误信息: ${error}</div>
          <p><a href="/api/feishu-verify">重新授权</a></p>
      </body>
      </html>
      `;
      
      return {
        statusCode: 400,
        headers,
        body: errorHtml
      };
    }

    // 检查是否有授权码
    if (!code) {
      const noCodeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>授权失败</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 4px; margin: 20px 0; }
          </style>
      </head>
      <body>
          <h1>❌ 授权失败</h1>
          <div class="error">未收到授权码</div>
          <p><a href="/api/feishu-verify">重新授权</a></p>
      </body>
      </html>
      `;
      
      return {
        statusCode: 400,
        headers,
        body: noCodeHtml
      };
    }

    // 使用授权码获取访问令牌
    console.log('开始获取访问令牌...');
    
    const tokenRequest = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET,
        code: code,
        redirect_uri: FEISHU_REDIRECT_URI
      })
    };

    console.log('Token请求参数:', JSON.stringify(tokenRequest.body, null, 2));
    console.log('请求URL: https://open.feishu.cn/open-apis/authen/v1/oidc/access_token');

    const tokenResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/oidc/access_token', tokenRequest);
    console.log('HTTP响应状态:', tokenResponse.status);
    
    const tokenData = await tokenResponse.json();
    console.log('Token响应:', JSON.stringify(tokenData, null, 2));

    if (tokenData.code === 0) {
      const accessToken = tokenData.data.access_token;
      const refreshToken = tokenData.data.refresh_token;
      const expiresIn = tokenData.data.expires_in;
      
      console.log('获取访问令牌成功');

      const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>授权成功</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                  max-width: 800px;
                  margin: 50px auto;
                  padding: 20px;
                  background-color: #f5f5f5;
                  line-height: 1.6;
              }
              .container {
                  background: white;
                  padding: 40px;
                  border-radius: 8px;
                  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .success {
                  color: #2e7d32;
                  background: #e8f5e8;
                  padding: 20px;
                  border-radius: 4px;
                  margin: 20px 0;
                  text-align: center;
              }
              .token-box {
                  background: #f8f9fa;
                  border: 1px solid #dee2e6;
                  border-radius: 4px;
                  padding: 15px;
                  margin: 15px 0;
                  font-family: monospace;
                  font-size: 12px;
                  word-break: break-all;
                  max-height: 150px;
                  overflow-y: auto;
              }
              .copy-btn {
                  background-color: #007bff;
                  color: white;
                  border: none;
                  padding: 8px 16px;
                  border-radius: 4px;
                  cursor: pointer;
                  margin: 5px;
              }
              .copy-btn:hover {
                  background-color: #0056b3;
              }
              .instructions {
                  background-color: #fff3cd;
                  border: 1px solid #ffeaa7;
                  border-radius: 4px;
                  padding: 15px;
                  margin: 20px 0;
              }
              h1 { color: #333; text-align: center; }
              h3 { color: #495057; margin-top: 25px; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>🎉 授权成功！</h1>
              <div class="success">
                  您已成功授权飞书文档访问权限！
              </div>
              
              <div class="instructions">
                  <strong>📋 接下来的步骤：</strong>
                  <ol>
                      <li>复制下面的访问令牌</li>
                      <li>在您的本地项目中设置环境变量</li>
                      <li>运行测试脚本验证文档创建功能</li>
                  </ol>
              </div>

              <h3>🔑 访问令牌 (Access Token):</h3>
              <div class="token-box" id="accessToken">${accessToken}</div>
              <button class="copy-btn" onclick="copyToken('accessToken')">复制访问令牌</button>

              <h3>🔄 刷新令牌 (Refresh Token):</h3>
              <div class="token-box" id="refreshToken">${refreshToken}</div>
              <button class="copy-btn" onclick="copyToken('refreshToken')">复制刷新令牌</button>

              <h3>⏰ 令牌有效期:</h3>
              <p>访问令牌将在 ${expiresIn} 秒后过期 (约 ${Math.round(expiresIn / 3600)} 小时)</p>

              <div class="instructions">
                  <strong>💡 使用说明：</strong>
                  <br>请在您的 <code>.env</code> 文件中设置：
                  <br><code>FEISHU_USER_ACCESS_TOKEN=${accessToken}</code>
                  <br>然后运行您的测试脚本来创建飞书文档。
              </div>
          </div>

          <script>
              function copyToken(elementId) {
                  const element = document.getElementById(elementId);
                  const text = element.textContent;
                  
                  navigator.clipboard.writeText(text).then(function() {
                      const btn = event.target;
                      const originalText = btn.textContent;
                      btn.textContent = '✅ 已复制';
                      btn.style.backgroundColor = '#28a745';
                      
                      setTimeout(function() {
                          btn.textContent = originalText;
                          btn.style.backgroundColor = '#007bff';
                      }, 2000);
                  }).catch(function(err) {
                      alert('复制失败，请手动复制令牌');
                  });
              }
          </script>
      </body>
      </html>
      `;

      return {
        statusCode: 200,
        headers,
        body: successHtml
      };

    } else {
      console.error('获取令牌失败:', tokenData);
      
      const tokenErrorHtml = `
      <!DOCTYPE html>
      <html>
      <head>
          <title>获取令牌失败</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
              .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 4px; margin: 20px 0; }
              .details { font-family: monospace; font-size: 12px; text-align: left; }
          </style>
      </head>
      <body>
          <h1>❌ 获取令牌失败</h1>
          <div class="error">
              <div>错误代码: ${tokenData.code}</div>
              <div>错误信息: ${tokenData.msg || '未知错误'}</div>
              <div class="details">详细信息: ${JSON.stringify(tokenData, null, 2)}</div>
          </div>
          <p><a href="/api/feishu-verify">重新授权</a></p>
      </body>
      </html>
      `;

      return {
        statusCode: 400,
        headers,
        body: tokenErrorHtml
      };
    }

  } catch (error) {
    console.error('处理回调时发生错误:', error);
    
    const serverErrorHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>服务器错误</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 4px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>❌ 处理授权时出错</h1>
        <div class="error">错误信息: ${error.message}</div>
        <p><a href="/api/feishu-verify">重新授权</a></p>
    </body>
    </html>
    `;

    return {
      statusCode: 500,
      headers,
      body: serverErrorHtml
    };
  }
}; 
