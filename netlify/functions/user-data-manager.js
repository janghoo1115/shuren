/**
 * 用户数据管理函数
 * 用于存储和获取用户的飞书token信息
 * 注意：这是一个临时方案，生产环境应该使用数据库
 */

const userStore = require('./shared/user-store');

exports.handler = async (event, context) => {
  console.log('用户数据管理请求:', event.httpMethod, event.path);

  // 设置CORS头
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // 处理OPTIONS预检请求
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { httpMethod, queryStringParameters, body } = event;
    const requestBody = body ? JSON.parse(body) : {};

    switch (httpMethod) {
      case 'POST':
        // 检查是否是内部请求获取token
        if (requestBody.action === 'get_token_internal') {
          return getTokenInternal(requestBody.user_id, headers);
        }
        return storeUserDataAPI(requestBody, headers);
      case 'GET':
        const userId = queryStringParameters?.user_id;
        return getUserDataAPI(userId, headers);
      case 'PUT':
        return updateUserDataAPI(requestBody, headers);
      case 'DELETE':
        const deleteUserId = queryStringParameters?.user_id;
        return deleteUserDataAPI(deleteUserId, headers);
      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: '不支持的HTTP方法' })
        };
    }

  } catch (error) {
    console.error('用户数据管理错误:', error);
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

/**
 * 存储用户数据API
 */
function storeUserDataAPI(data, headers) {
  try {
    const result = userStore.storeUserData(data);
    
    if (result.success) {
      const { access_token, ...safeData } = result.data;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '用户数据存储成功',
          data: safeData
        })
      };
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: result.error,
          required: ['user_id', 'access_token', 'main_document_id'] 
        })
      };
    }
  } catch (error) {
    console.error('存储用户数据失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '存储用户数据失败', 
        message: error.message 
      })
    };
  }
}

/**
 * 获取用户数据API
 */
function getUserDataAPI(userId, headers) {
  try {
    const result = userStore.getUserSafeData(userId);
    
    if (result.success) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: result.data
        })
      };
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: result.error,
          message: result.message || '用户可能尚未完成飞书授权'
        })
      };
    }
  } catch (error) {
    console.error('获取用户数据失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '获取用户数据失败', 
        message: error.message 
      })
    };
  }
}

/**
 * 更新用户数据API
 */
function updateUserDataAPI(data, headers) {
  try {
    const { user_id, ...updateFields } = data;
    const result = userStore.updateUserData(user_id, updateFields);
    
    if (result.success) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: '用户数据更新成功'
        })
      };
    } else {
      const statusCode = result.error === '用户数据未找到' ? 404 : 400;
      return {
        statusCode,
        headers,
        body: JSON.stringify({ error: result.error })
      };
    }
  } catch (error) {
    console.error('更新用户数据失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '更新用户数据失败', 
        message: error.message 
      })
    };
  }
}

/**
 * 删除用户数据API
 */
function deleteUserDataAPI(userId, headers) {
  try {
    const result = userStore.deleteUserData(userId);
    
    if (result.success) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: result.message
        })
      };
    } else {
      const statusCode = result.error === '用户数据未找到' ? 404 : 400;
      return {
        statusCode,
        headers,
        body: JSON.stringify({ error: result.error })
      };
    }
  } catch (error) {
    console.error('删除用户数据失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '删除用户数据失败', 
        message: error.message 
      })
    };
  }
}

/**
 * 内部获取完整用户token信息
 */
function getTokenInternal(userId, headers) {
  try {
    const result = userStore.getUserData(userId);
    
    if (result.success) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          data: result.data
        })
      };
    } else {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: result.error,
          success: false
        })
      };
    }
  } catch (error) {
    console.error('内部获取用户token失败:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: '内部获取用户token失败', 
        message: error.message,
        success: false
      })
    };
  }
} 
