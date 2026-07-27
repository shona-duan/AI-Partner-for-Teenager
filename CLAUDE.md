# CLAUDE.md

## 项目背景

这是一个 Node.js 后端服务，对接 DeepSeek LLM API + 火山引擎 TTS，为小学/初中生提供 AI 学习伙伴。
目前只有一个 Express 后端（server.js）+ 静态 HTML 页面，没有前端框架。

## 当前任务：升级为全栈 AI 教育助手

目标：把这个项目改造成一个可展示的全栈 AI 应用，用于简历展示（前端 AI 方向求职）。

### 改造计划

**Phase 1：后端加 SSE 流式接口**
- 新增 `POST /chat/stream` 接口
- 使用 DeepSeek API 的 `stream: true` 模式
- 通过 Server-Sent Events 逐 token 推送给前端
- 接收参数：`{ message, sessionId, role }`
- role 用于切换不同教学角色的 system prompt（数学老师、英语老师、科学老师等）
- 原有的 `GET /chat` 接口保留不动（TurboWarp 集成还在用）

**Phase 2：React 前端**
- 在项目根目录新建 `client/` 文件夹
- 技术栈：Vite + React + TypeScript
- 核心功能：
  - 聊天界面（消息列表 + 输入框）
  - 流式渲染（逐 token 显示，打字机效果）
  - 多角色切换（数学/英语/科学，对应不同 system prompt）
  - Markdown 渲染（AI 回复支持代码块、列表等）
  - 响应式设计（移动端适配）
- 样式：简洁现代，浅色系，教育产品风格

**Phase 3：部署与收尾**
- 前端部署到 Vercel
- 后端部署到 Railway 或 Render
- 写 README.md（项目介绍、技术栈、本地运行方法、在线 demo 链接）
- 推送到 GitHub

### 技术要点

- DeepSeek streaming API 文档：POST `https://api.deepseek.com/v1/chat/completions`，body 加 `stream: true`，响应为 SSE 格式（`data: {...}` 逐行）
- 前端用 `EventSource` 或 `fetch` + `ReadableStream` 消费 SSE
- 环境变量从 `.env.local` 读取（已有 DEEPSEEK_API_KEY、VOLC_APPID、VOLC_TOKEN）

### 文件结构（目标）

```
deepseek-sever/
├── server.js            # 后端主文件（已有，需新增 /chat/stream）
├── client/              # React 前端（新建）
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── InputBar.tsx
│   │   │   └── RoleSelector.tsx
│   │   ├── hooks/
│   │   │   └── useStreamChat.ts
│   │   └── types.ts
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── public/              # 原有静态页面（保留）
├── package.json         # 后端 package.json
├── .env.local           # 环境变量（不提交）
└── CLAUDE.md            # 本文件
```

### 注意事项

- 中文交流，代码注释用中文
- 不确定的事先问再做
- 原有功能不破坏（GET /chat + TTS + 静态页面都要继续能用）
- .env.local 不提交到 git
