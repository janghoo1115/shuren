/**
 * 共享用户数据存储模块
 * 用于在不同的Netlify Functions之间共享用户数据
 */

// 用户数据存储（内存存储，生产环境应使用数据库）
const userDataStore = new Map();

/**
 * 存储用户数据
 */
function storeUserData(userData) {
  try {
    const { user_id, user_name, access_token, main_document_id } = userData;
    
    if (!user_id || !access_token || !main_document_id) {
      throw new Error('缺少必需参数');
    }

    const data = {
      user_id,
      user_name: user_name || '用户',
      access_token,
      main_document_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    userDataStore.set(user_id, data);
    console.log('用户数据已存储:', { user_id, user_name, main_document_id });
    
    return { success: true, data };
  } catch (error) {
    console.error('存储用户数据失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 获取用户数据
 */
function getUserData(userId) {
  try {
    if (!userId) {
      return { success: false, error: '缺少user_id参数' };
    }

    const userData = userDataStore.get(userId);
    
    if (!userData) {
      return { 
        success: false, 
        error: '用户数据未找到',
        message: '用户可能尚未完成飞书授权'
      };
    }

    return { success: true, data: userData };
  } catch (error) {
    console.error('获取用户数据失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 获取用户安全数据（不包含敏感token）
 */
function getUserSafeData(userId) {
  try {
    const result = getUserData(userId);
    
    if (!result.success) {
      return result;
    }

    const { access_token, ...safeData } = result.data;
    safeData.has_token = !!access_token;

    return { success: true, data: safeData };
  } catch (error) {
    console.error('获取用户安全数据失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 更新用户数据
 */
function updateUserData(userId, updateFields) {
  try {
    if (!userId) {
      return { success: false, error: '缺少user_id参数' };
    }

    const existingData = userDataStore.get(userId);
    if (!existingData) {
      return { success: false, error: '用户数据未找到' };
    }

    const updatedData = {
      ...existingData,
      ...updateFields,
      updated_at: new Date().toISOString()
    };

    userDataStore.set(userId, updatedData);
    console.log('用户数据已更新:', { userId, updateFields });

    return { success: true, data: updatedData };
  } catch (error) {
    console.error('更新用户数据失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 删除用户数据
 */
function deleteUserData(userId) {
  try {
    if (!userId) {
      return { success: false, error: '缺少user_id参数' };
    }

    const deleted = userDataStore.delete(userId);
    
    if (!deleted) {
      return { success: false, error: '用户数据未找到' };
    }

    console.log('用户数据已删除:', userId);
    return { success: true, message: '用户数据删除成功' };
  } catch (error) {
    console.error('删除用户数据失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 获取所有用户数据（管理用）
 */
function getAllUsers() {
  try {
    const users = Array.from(userDataStore.entries()).map(([userId, userData]) => {
      const { access_token, ...safeData } = userData;
      return { ...safeData, has_token: !!access_token };
    });

    return { success: true, data: users, count: users.length };
  } catch (error) {
    console.error('获取所有用户数据失败:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  storeUserData,
  getUserData,
  getUserSafeData,
  updateUserData,
  deleteUserData,
  getAllUsers
}; 
