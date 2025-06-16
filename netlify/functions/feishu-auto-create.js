/**
 * 飞书OAuth授权回调处理函数 - 自动创建文档版本
 * 用户授权后自动在其飞书账户中创建测试文档
 */
exports.handler = async (event, context) => {
  console.log('收到飞书OAuth回调:', event.httpMethod, event.queryStringParameters);

  // 设置CORS头
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'text/html; charset=utf-8'
  };

  // 处理OPTIONS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // 只处理GET请求
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: '方法不允许' })
    };
  }

  try {
    // 飞书应用配置
    const FEISHU_APP_ID = "cli_a8c3c35f5230d00e";
    const FEISHU_APP_SECRET = "bAbJhKTOnzLyBxHwbK2hkgkRPFsPTRgw";

    // 获取查询参数
    const { code, error, state } = event.queryStringParameters || {};
    console.log('回调参数:', { code: code ? `${code.substring(0, 10)}...` : null, error, state });

    // 处理错误情况
    if (error) {
      return createErrorPage('授权失败', `错误信息: ${error}`, headers);
    }

    if (!code) {
      return createErrorPage('授权失败', '未收到授权码', headers);
    }

    // 获取访问令牌
    console.log('开始获取访问令牌...');
    const tokenResponse = await fetch('https://open.feishu.cn/open-apis/authen/v1/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code,
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET
      })
    });
    
    const tokenData = await tokenResponse.json();
    console.log('Token响应状态:', tokenData.code);

    if (tokenData.code !== 0) {
      return createErrorPage(
        '获取访问令牌失败', 
        `错误代码: ${tokenData.code}<br>错误信息: ${tokenData.msg || '未知错误'}`, 
        headers
      );
    }

    const accessToken = tokenData.data.access_token;
    console.log('✅ 获取访问令牌成功');

    // 获取用户信息
    const userInfo = await getUserInfo(accessToken);
    console.log('用户信息:', userInfo.name);
    
    // 自动创建文档
    console.log('开始创建文档...');
    const createResult = await createDocument(accessToken, userInfo.name || '用户');

    if (createResult.success) {
      console.log('✅ 文档创建成功:', createResult.documentId);
      return createSuccessPage(userInfo, createResult, headers);
    } else {
      console.error('❌ 文档创建失败:', createResult.error);
      return createErrorPage('文档创建失败', createResult.error, headers);
    }

  } catch (error) {
    console.error('处理OAuth回调时发生错误:', error);
    return createErrorPage('服务器错误', '处理授权回调时发生错误，请稍后重试。', headers);
  }
};

/**
 * 获取用户信息
 */
async function getUserInfo(accessToken) {
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/authen/v1/user_info', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    if (data.code === 0) {
      return data.data;
    } else {
      console.error('获取用户信息失败:', data);
      return { name: '用户' };
    }
  } catch (error) {
    console.error('获取用户信息异常:', error);
    return { name: '用户' };
  }
}

/**
 * 创建飞书文档
 */
async function createDocument(accessToken, userName) {
  try {
    // 1. 创建文档
    const createResponse = await fetch('https://open.feishu.cn/open-apis/docx/v1/documents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: `${userName}的数刃AI测试文档`,
        folder_token: ""
      })
    });

    const createData = await createResponse.json();
    console.log('创建文档响应状态:', createData.code);

    if (createData.code !== 0) {
      return { success: false, error: `创建文档失败: ${createData.msg}` };
    }

    const documentId = createData.data.document.document_id;
    const documentTitle = createData.data.document.title;

    // 2. 添加文档内容
    const contentResponse = await fetch(
      `https://open.feishu.cn/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          children: [
            {
              block_type: 2, // 文本块
              text: {
                elements: [
                  {
                    text_run: {
                      content: `🎉 恭喜 ${userName}！\n\n这是通过数刃AI系统自动创建的飞书文档。\n\n✅ OAuth授权成功\n✅ 文档创建成功\n✅ 内容添加成功\n\n现在您可以在飞书中找到这个文档并进行编辑。\n\n感谢您体验数刃AI的飞书集成功能！`,
                      text_element_style: {}
                    }
                  }
                ],
                style: {}
              }
            }
          ],
          index: 0
        })
      }
    );

    const contentData = await contentResponse.json();
    console.log('添加内容响应状态:', contentData.code);

    if (contentData.code === 0) {
      return {
        success: true,
        documentId: documentId,
        title: documentTitle,
        url: `https://bytedance.feishu.cn/docx/${documentId}`
      };
    } else {
      return { success: false, error: `添加文档内容失败: ${contentData.msg}` };
    }

  } catch (error) {
    console.error('创建文档异常:', error);
    return { success: false, error: `创建文档时发生异常: ${error.message}` };
  }
}

/**
 * 创建成功页面
 */
function createSuccessPage(userInfo, createResult, headers) {
  const successHtml = `
  <!DOCTYPE html>
  <html>
  <head>
      <title>文档创建成功</title>
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
          .success-icon {
              font-size: 64px;
              margin-bottom: 20px;
          }
          h1 {
              color: #2e7d32;
              margin-bottom: 20px;
          }
          .user-info {
              background: #e8f5e8;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
          }
          .document-info {
              background: #f8f9fa;
              border: 1px solid #dee2e6;
              border-radius: 8px;
              padding: 20px;
              margin: 20px 0;
              text-align: left;
          }
          .btn {
              display: inline-block;
              background-color: #00B96B;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              margin: 10px;
              font-weight: 500;
              transition: background-color 0.3s;
          }
          .btn:hover {
              background-color: #009954;
          }
          .btn-secondary {
              background-color: #6c757d;
          }
          .btn-secondary:hover {
              background-color: #545b62;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="success-icon">🎉</div>
          <h1>文档创建成功！</h1>
          
          <div class="user-info">
              <strong>👤 用户信息</strong><br>
              姓名: ${userInfo.name || '用户'}<br>
              ${userInfo.email ? `邮箱: ${userInfo.email}<br>` : ''}
          </div>
          
          <div class="document-info">
              <strong>📄 文档信息</strong><br>
              <strong>标题:</strong> ${createResult.title}<br>
              <strong>文档ID:</strong> ${createResult.documentId}<br>
              <strong>创建时间:</strong> ${new Date().toLocaleString('zh-CN')}
          </div>
          
          <p>您的飞书文档已成功创建！现在可以在飞书中查看和编辑这个文档。</p>
          
          <a href="${createResult.url}" class="btn" target="_blank">📖 打开文档</a>
          <a href="https://shurenai.xyz" class="btn btn-secondary">🏠 返回首页</a>
      </div>
  </body>
  </html>
  `;

  return {
    statusCode: 200,
    headers,
    body: successHtml
  };
}

/**
 * 创建错误页面
 */
function createErrorPage(title, message, headers) {
  const errorHtml = `
  <!DOCTYPE html>
  <html>
  <head>
      <title>${title}</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
          body { 
              font-family: Arial, sans-serif; 
              max-width: 600px; 
              margin: 50px auto; 
              padding: 20px; 
              text-align: center; 
          }
          .error { 
              color: #d32f2f; 
              background: #ffebee; 
              padding: 20px; 
              border-radius: 4px; 
              margin: 20px 0; 
          }
          .btn {
              display: inline-block;
              background-color: #00B96B;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              margin: 10px;
          }
      </style>
  </head>
  <body>
      <h1>❌ ${title}</h1>
      <div class="error">${message}</div>
      <a href="/.netlify/functions/feishu-auto-verify" class="btn">🔄 重新授权</a>
      <a href="https://shurenai.xyz" class="btn">🏠 返回首页</a>
  </body>
  </html>
  `;

  return {
    statusCode: 400,
    headers,
    body: errorHtml
  };
} 
