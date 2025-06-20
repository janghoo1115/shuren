require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// 添加调试日志
console.log('开始启动数刃AI后端服务...');
console.log('Node版本:', process.version);
console.log('工作目录:', process.cwd());

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
console.log('正在加载路由模块...');
const wechatRoutes = require('./routes/wechat');
console.log('微信路由加载成功');
const feishuRoutes = require('./routes/feishu');
console.log('飞书路由加载成功');
const userRoutes = require('./routes/user');
console.log('用户路由加载成功');

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
  next();
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`数刃AI后端服务启动成功，端口: ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
}); 
