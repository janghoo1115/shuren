const express = require('express');
const router = express.Router();

// 简单的内存存储（生产环境建议使用数据库）
let userData = new Map();

// 获取用户数据
router.get('/data/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const data = userData.get(userId) || {};
    
    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('获取用户数据失败:', error);
    res.status(500).json({ error: '获取用户数据失败' });
  }
});

// 保存用户数据
router.post('/data/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const data = req.body;
    
    // 合并现有数据
    const existingData = userData.get(userId) || {};
    const mergedData = { ...existingData, ...data, lastUpdated: new Date().toISOString() };
    
    userData.set(userId, mergedData);
    
    res.json({
      success: true,
      message: '用户数据保存成功',
      data: mergedData
    });
  } catch (error) {
    console.error('保存用户数据失败:', error);
    res.status(500).json({ error: '保存用户数据失败' });
  }
});

// 删除用户数据
router.delete('/data/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const deleted = userData.delete(userId);
    
    res.json({
      success: true,
      message: deleted ? '用户数据删除成功' : '用户数据不存在'
    });
  } catch (error) {
    console.error('删除用户数据失败:', error);
    res.status(500).json({ error: '删除用户数据失败' });
  }
});

// 获取所有用户列表（调试用）
router.get('/list', (req, res) => {
  try {
    const users = Array.from(userData.keys());
    
    res.json({
      success: true,
      users: users,
      count: users.length
    });
  } catch (error) {
    console.error('获取用户列表失败:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 清空所有用户数据（调试用）
router.delete('/clear-all', (req, res) => {
  try {
    userData.clear();
    
    res.json({
      success: true,
      message: '所有用户数据已清空'
    });
  } catch (error) {
    console.error('清空用户数据失败:', error);
    res.status(500).json({ error: '清空用户数据失败' });
  }
});

module.exports = router; 
