/**
 * 飞书OAuth授权验证函数 - 自动创建文档版本
 * 生成授权URL，用户授权后自动创建文档
 */
exports.handler = async (event, context) => {
  console.log('收到飞书自动创建授权请求:', event.httpMethod);

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

  try {
    // 飞书应用配置
    const FEISHU_APP_ID = "cli_a8c3c35f5230d00e";
    const FEISHU_REDIRECT_URI = "https://shurenai.xyz/.netlify/functions/feishu-auto-create";
    const FEISHU_SCOPE = "drive:drive";

    // 生成状态参数（可选，用于防CSRF）
    const state = Math.random().toString(36).substring(2, 15);

    // 构建飞书OAuth授权URL
    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?` +
      `app_id=${FEISHU_APP_ID}&` +
      `redirect_uri=${encodeURIComponent(FEISHU_REDIRECT_URI)}&` +
      `scope=${FEISHU_SCOPE}&` +
      `state=${state}&` +
      `response_type=code`;

    console.log('生成授权URL成功');

    // 创建引导页面
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>数刃AI - 飞书文档自动创建</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                background-color: #f5f5f5;
                line-height: 1.6;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                text-align: center;
            }
            .logo {
                font-size: 48px;
                margin-bottom: 20px;
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
                font-size: 2.5em;
                font-weight: 300;
            }
            .description {
                color: #666;
                margin: 30px 0;
                font-size: 1.1em;
            }
            .feature-list {
                text-align: left;
                background: #f8f9fa;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
            }
            .feature-list li {
                margin: 10px 0;
                list-style: none;
                padding-left: 20px;
                position: relative;
            }
            .feature-list li:before {
                content: "✅";
                position: absolute;
                left: 0;
            }
            .auth-btn {
                display: inline-block;
                background: linear-gradient(45deg, #00B96B, #009954);
                color: white;
                padding: 16px 32px;
                text-decoration: none;
                border-radius: 25px;
                font-size: 1.1em;
                font-weight: 500;
                margin: 20px 0;
                box-shadow: 0 4px 15px rgba(0, 185, 107, 0.3);
                transition: all 0.3s ease;
            }
            .auth-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0, 185, 107, 0.4);
            }
            .warning {
                background: #fff3cd;
                border: 1px solid #ffeaa7;
                color: #856404;
                padding: 15px;
                border-radius: 8px;
                margin: 20px 0;
                font-size: 0.9em;
            }
            .redirect-info {
                color: #666;
                font-size: 0.9em;
                margin-top: 30px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">🤖</div>
            <h1>数刃AI</h1>
            <div class="description">
                欢迎体验数刃AI的飞书集成功能！
            </div>
            
            <div class="feature-list">
                <strong>📋 功能说明：</strong>
                <ul>
                    <li>点击授权按钮登录您的飞书账户</li>
                    <li>系统将自动在您的飞书中创建一个测试文档</li>
                    <li>文档包含欢迎内容和功能说明</li>
                    <li>您可以立即在飞书中查看和编辑该文档</li>
                </ul>
            </div>
            
            <div class="warning">
                <strong>⚠️ 权限说明：</strong><br>
                此应用仅会访问您的飞书云文档权限，用于创建测试文档。不会访问您的其他数据。
            </div>
            
            <a href="${authUrl}" class="auth-btn">
                🚀 开始授权并创建文档
            </a>
            
            <div class="redirect-info">
                点击授权后，您将跳转到飞书进行身份验证，<br>
                完成后会自动创建文档并显示结果。
            </div>
        </div>
        
        <script>
            // 自动跳转选项（可选）
            const autoRedirect = new URLSearchParams(window.location.search).get('auto');
            if (autoRedirect === 'true') {
                setTimeout(() => {
                    window.location.href = '${authUrl}';
                }, 2000);
            }
        </script>
    </body>
    </html>
    `;

    return {
      statusCode: 200,
      headers,
      body: html
    };

  } catch (error) {
    console.error('生成授权URL时发生错误:', error);
    
    const errorHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>授权失败</title>
        <meta charset="utf-8">
        <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #d32f2f; background: #ffebee; padding: 20px; border-radius: 4px; }
        </style>
    </head>
    <body>
        <h1>❌ 服务器错误</h1>
        <div class="error">生成授权URL时发生错误，请稍后重试。</div>
        <a href="https://shurenai.xyz">🏠 返回首页</a>
    </body>
    </html>
    `;

    return {
      statusCode: 500,
      headers,
      body: errorHtml
    };
  }
}; 
