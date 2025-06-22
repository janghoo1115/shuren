require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

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

// 为企微回调专门配置XML解析
app.use('/api/wechat/callback', bodyParser.text({ type: 'text/xml' }));
app.use('/api/wechat/kf/callback', bodyParser.text({ type: 'text/xml' }));
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
  const userAgent = req.get('User-Agent') || '';
  const isHeartbeat = userAgent.includes('heartbeat-keepalive');
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    heartbeat: isHeartbeat,
    uptime: process.uptime()
  });
  
  if (isHeartbeat) {
    console.log(`心跳检查 - 服务运行时间: ${Math.floor(process.uptime())}秒`);
  }
});

// IP检查
app.get('/ip', async (req, res) => {
  try {
    const response = await fetch('https://httpbin.org/ip');
    const data = await response.json();
    res.json({ 
      server_ip: data.origin,
      timestamp: new Date().toISOString(),
      message: '这是Render服务器的出站IP'
    });
  } catch (error) {
    res.json({ 
      error: '无法获取IP',
      timestamp: new Date().toISOString()
    });
  }
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

// 心跳保活机制
function startHeartbeat() {
  const HEARTBEAT_INTERVAL = 12 * 60 * 1000; // 12分钟
  const SERVICE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  
  console.log('启动心跳保活机制...');
  console.log(`心跳间隔: ${HEARTBEAT_INTERVAL / 1000}秒`);
  console.log(`服务URL: ${SERVICE_URL}`);
  
  setInterval(async () => {
    try {
      const response = await fetch(`${SERVICE_URL}/health`, {
        method: 'GET',
        headers: {
          'User-Agent': 'heartbeat-keepalive/1.0'
        },
        timeout: 10000
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`心跳成功 - 运行时间: ${Math.floor(data.uptime)}秒`);
      } else {
        console.warn(`心跳响应异常: ${response.status}`);
      }
    } catch (error) {
      console.error('心跳失败:', error.message);
    }
  }, HEARTBEAT_INTERVAL);
}

app.listen(PORT, () => {
  console.log(`数刃AI后端服务启动成功，端口: ${PORT}`);
  console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
  
  // 延迟3秒启动心跳，确保服务完全启动
  setTimeout(() => {
    startHeartbeat();
  }, 3000);
}); 
