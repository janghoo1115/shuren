# 数刃AI 官网

这是数刃AI的官方网站，包含飞书机器人集成功能。

## 项目结构

```
├── index.html                    # 主页面
├── netlify/
│   └── functions/               # Netlify Functions
│       ├── utils/
│       │   ├── crypto.js        # 飞书加解密工具
│       │   └── feishu-api.js    # 飞书API客户端
│       ├── feishu-verify.js     # 飞书URL验证函数
│       └── feishu-callback.js   # 飞书事件回调函数
├── netlify.toml                 # Netlify配置文件
├── package.json                 # 项目依赖配置
└── README.md                    # 项目说明
```

## 功能特性

- 🎨 苹果风格的现代化UI设计
- 🤖 完整的飞书机器人集成
- 🔐 飞书消息加解密和签名验证
- 📞 飞书事件回调处理
- ☁️ Netlify Functions无服务器架构

## 部署步骤

### 1. 在Netlify上部署

#### 方法一：通过GitHub（推荐）
1. 将代码推送到GitHub仓库
2. 在Netlify控制台连接GitHub仓库
3. 设置构建命令和发布目录
4. 配置环境变量

#### 方法二：手动部署
1. 访问 [netlify.com](https://netlify.com)
2. 将项目文件夹拖拽到部署区域
3. 等待部署完成

### 2. 配置环境变量

在Netlify控制台的 Site settings > Environment variables 中添加以下环境变量：

```env
FEISHU_APP_ID=你的飞书应用ID
FEISHU_APP_SECRET=你的飞书应用密钥
FEISHU_ENCRYPT_KEY=你的飞书加密密钥
FEISHU_VERIFICATION_TOKEN=你的飞书验证令牌
```

### 3. 绑定自定义域名

1. 在Netlify控制台的 Domain settings 中添加自定义域名 `shurenai.xyz`
2. 在火山引擎域名管理中设置DNS记录：
   - 类型：CNAME
   - 名称：@（或留空）
   - 值：你的Netlify站点名称.netlify.app
3. 等待DNS传播完成（通常需要几分钟到几小时）

### 4. 配置飞书应用

在飞书开放平台配置以下回调URL：

- 事件订阅URL：`https://shurenai.xyz/api/feishu-callback`
- URL验证：`https://shurenai.xyz/api/feishu-verify`

## API端点

- `GET/POST /api/feishu-verify` - 飞书URL验证
- `POST /api/feishu-callback` - 飞书事件回调处理

## 开发说明

### 本地开发

```bash
# 安装依赖
npm install

# 启动本地开发服务器
npm run dev
```

### 飞书加解密

项目使用AES-256-CBC加密算法处理飞书消息，具体实现在 `netlify/functions/utils/crypto.js` 中。

### 支持的飞书事件

- `url_verification` - URL验证
- `im.message.receive_v1` - 接收消息
- `application.app_uninstalled` - 应用卸载
- `application.app_open` - 应用打开

## 技术栈

- **前端**: HTML5 + CSS3
- **后端**: Netlify Functions (Node.js)
- **部署**: Netlify
- **域名**: 火山引擎
- **集成**: 飞书开放平台

## 安全注意事项

- 所有环境变量都存储在Netlify的安全环境中
- 飞书消息使用加密传输
- 签名验证确保消息来源的可靠性

## 许可证

MIT License 