require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors({
  origin: ['https://shurenai.xyz', 'http://localhost:3000', 'https://localhost:3000'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.raw({ type: 'text/xml' }));

// 导入路由
const wechatRoutes = require('./routes/wechat');
const feishuRoutes = require('./routes/feishu');
const userRoutes = require('./routes/user');

// 使用路由
app.use('/api/wechat', wechatRoutes);
app.use('/api/feishu', feishuRoutes);
app.use('/api/user', userRoutes);

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 根路径
app.get('/', (req, res) => {
  res.json({ 
    message: '数刃AI后端服务运行中',
    version: '1.0.0',
    endpoints: [
      '/api/wechat/*',
      '/api/feishu/*', 
      '/api/user/*',
      '/health'
    ]
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ 
    error: '服务器内部错误',
    message: process.env.NODE_ENV === 'development' ? err.message : '请稍后重试'
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`数刃AI后端服务启动成功，端口: ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
}); 
