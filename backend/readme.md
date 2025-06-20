# 数刃AI后端服务

基于Express.js的后端API服务，支持微信企业和飞书集成。

## 功能特性

- 🚀 Express.js后端框架
- 🔐 微信企业回调处理
- 📋 飞书OAuth文档创建
- 👥 用户数据管理
- 🌐 CORS跨域支持
- 🔧 环境变量配置

## API端点

### 微信相关
- `GET/POST /api/wechat/callback` - 微信企业回调处理
- `GET /api/wechat/access-token` - 获取微信访问令牌

### 飞书相关
- `GET /api/feishu/verify` - 飞书授权页面
- `GET /api/feishu/callback` - 飞书OAuth回调
- `GET /api/feishu/auto-verify` - 一键授权
- `GET /api/feishu/auto-create` - 自动创建文档

### 用户数据
- `GET /api/user/data/:userId` - 获取用户数据
- `POST /api/user/data/:userId` - 保存用户数据
- `DELETE /api/user/data/:userId` - 删除用户数据
- `GET /api/user/list` - 获取用户列表
- `DELETE /api/user/clear-all` - 清空所有数据

### 系统
- `GET /health` - 健康检查
- `GET /` - 服务信息

## 本地开发

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量：
```bash
cp env.example .env
# 编辑.env文件，填入实际配置
```

3. 启动开发服务器：
```bash
npm run dev
```

4. 生产环境运行：
```bash
npm start
```

## Render部署

1. 在Render.com创建新的Web Service
2. 连接GitHub仓库
3. 设置构建命令：`npm install`
4. 设置启动命令：`npm start`
5. 配置环境变量
6. 部署服务

## 环境变量配置

参考`env.example`文件，需要配置：

- 服务器配置（PORT、NODE_ENV）
- 微信企业配置（Token、密钥等）
- 飞书配置（App ID、Secret等）

## 技术栈

- Node.js 18+
- Express.js 4.x
- CORS
- dotenv
- body-parser

## 项目结构

```
backend/
├── server.js          # 主服务器文件
├── package.json       # 项目配置
├── env.example        # 环境变量示例
├── routes/            # 路由文件
│   ├── wechat.js     # 微信相关路由
│   ├── feishu.js     # 飞书相关路由
│   └── user.js       # 用户数据路由
├── utils/             # 工具函数
│   └── wechat-crypto.js # 微信加密工具
└── README.md          # 说明文档
``` 
