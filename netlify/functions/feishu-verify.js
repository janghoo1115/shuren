/**
 * 飞书OAuth授权页面
 * 显示授权页面并引导用户进行飞书授权
 */
exports.handler = async (event, context) => {
  console.log('飞书授权页面请求:', event.httpMethod);

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
    // 飞书应用配置
    const FEISHU_APP_ID = "cli_a8c3c35f5230d00e";
    const FEISHU_REDIRECT_URI = "https://shurenai.xyz/.netlify/functions/feishu-callback";

    // 构造授权URL
    const authUrl = `https://open.feishu.cn/open-apis/authen/v1/authorize?app_id=${FEISHU_APP_ID}&redirect_uri=${encodeURIComponent(FEISHU_REDIRECT_URI)}&scope=drive:drive&state=feishu_auth`;

    // 返回授权页面HTML
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>飞书授权</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                max-width: 600px;
                margin: 50px auto;
                padding: 20px;
                text-align: center;
                background-color: #f5f5f5;
                line-height: 1.6;
            }
            .container {
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            h1 {
                color: #333;
                margin-bottom: 20px;
            }
            p {
                color: #666;
                margin-bottom: 15px;
            }
            .btn {
                background-color: #00B96B;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                display: inline-block;
                margin: 20px 0;
                font-size: 16px;
                font-weight: 500;
                transition: background-color 0.3s;
            }
            .btn:hover {
                background-color: #009954;
            }
            .info {
                background-color: #f8f9fa;
                border-left: 4px solid #00B96B;
                padding: 15px;
                margin: 20px 0;
                text-align: left;
            }
            .small {
                font-size: 14px;
                color: #888;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🚀 飞书文档授权</h1>
            <p>为了让系统能够创建和编辑您的飞书文档，需要您授权文档访问权限。</p>
            
            <div class="info">
                <strong>授权后系统将能够：</strong>
                <ul style="margin: 10px 0; padding-left: 20px;">
                    <li>在您的飞书空间创建新文档</li>
                    <li>编辑和更新文档内容</li>
                    <li>自动保存AI总结的对话记录</li>
                </ul>
            </div>
            
            <p>点击下方按钮进行安全授权：</p>
            <a href="${authUrl}" class="btn">🔐 授权飞书文档访问</a>
            
            <p class="small">
                授权过程完全安全，遵循飞书官方OAuth2.0标准协议。<br>
                您可以随时在飞书设置中撤销授权。
            </p>
        </div>
    </body>
    </html>
    `;

    return {
      statusCode: 200,
      headers,
      body: htmlContent
    };

  } catch (error) {
    console.error('生成授权页面时发生错误:', error);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: '服务器内部错误' })
    };
  }
}; 
