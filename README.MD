# AI 学习助手

全栈 AI 教育应用，为中小学生提供智能学习辅导。支持流式对话、多角色切换、作业图片识别反馈。

## 在线体验

> 🔗 Demo: （部署后补充链接）

## 技术栈

**前端**
- React 19 + TypeScript
- Vite
- Server-Sent Events (SSE) 流式渲染
- react-markdown（Markdown 渲染）

**后端**
- Node.js + Express
- DeepSeek API（对话生成）
- 火山引擎 TTS（语音合成）
- 火山方舟 豆包视觉模型（图片识别）
- multer（图片上传）

## 核心功能

| 功能 | 说明 |
|------|------|
| 流式对话 | SSE 逐 token 推送，打字机效果 |
| 多角色系统 | Tutor（引导式辅导）、Mentor（作业反馈）、Coach（学习规划） |
| 图片识别 | 支持粘贴/上传最多 5 张作业图片，视觉模型识别后生成反馈 |
| 会话隔离 | 按 sessionId 独立维护上下文，24h 自动过期 |
| 语音合成 | 火山引擎 TTS，AI 回复可转语音播放 |
| Markdown 渲染 | 代码块、列表、表格、引用完整支持 |

## 架构

```
┌─────────────┐       SSE        ┌─────────────────┐
│  React 前端  │ ◄──────────────► │  Express 后端    │
│  (Vercel)   │                  │  (Railway)       │
└─────────────┘                  └────────┬────────┘
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                 ▼
                  DeepSeek API     豆包视觉模型      火山引擎 TTS
                  (对话生成)       (图片识别)        (语音合成)
```

## 本地运行

### 前置条件

- Node.js >= 18
- DeepSeek API Key
- 火山引擎 TTS 凭证（VOLC_APPID、VOLC_TOKEN）
- （可选）火山方舟视觉模型 Key（图片功能需要）

### 步骤

```bash
# 1. 克隆项目
git clone https://github.com/你的用户名/deepseek-sever.git
cd deepseek-sever

# 2. 安装后端依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local 填入你的 API Key

# 4. 安装前端依赖
cd client && npm install

# 5. 启动后端（端口 3001）
cd .. && npm start

# 6. 启动前端（另开终端，端口 5173）
cd client && npm run dev
```

浏览器打开 `http://localhost:5173`

### 环境变量说明

```env
DEEPSEEK_API_KEY=你的DeepSeek API Key
VOLC_APPID=火山引擎 TTS AppID
VOLC_TOKEN=火山引擎 TTS Token
VOLC_VISION_API_KEY=火山方舟视觉模型 API Key（可选）
VOLC_VISION_ENDPOINT=火山方舟视觉模型 Endpoint ID（可选）
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/chat` | 非流式对话 + TTS（TurboWarp 集成用） |
| POST | `/chat/stream` | 流式对话（SSE） |
| POST | `/chat/image` | 图片上传 + 视觉分析 + 流式反馈 |

## 项目结构

```
deepseek-sever/
├── server.js              # 后端主文件
├── client/                # React 前端
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/    # UI 组件
│   │   ├── hooks/         # 自定义 Hook（useStreamChat）
│   │   └── types.ts       # 类型定义
│   ├── package.json
│   └── vite.config.ts
├── public/                # 静态页面（旧版，保留）
├── package.json
└── .env.local             # 环境变量（不提交）
```

## License

MIT
