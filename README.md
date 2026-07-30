# AI Learning Partner

全栈 AI 教育应用，为中小学生提供智能学习辅导。具备 Agent 能力：自主规划学习路径、调用工具生成练习题、评估掌握进度。

## 在线体验

🔗 **Demo**: [ai-partner-for-teenager.vercel.app](https://ai-partner-for-teenager.vercel.app)

## 技术亮点

- **AI Agent 架构** — Coach 模式具备完整 Agent 能力：状态管理（Plan JSON）+ Function Calling（工具调用）
- **流式对话** — SSE 逐 token 推送，前端打字机渲染
- **多模态输入** — 支持图片上传，豆包视觉模型识别作业内容
- **多角色系统** — Tutor / Mentor / Coach 三种教学策略，system prompt 动态切换

## 技术栈

**前端** — React 19 + TypeScript + Vite

**后端** — Node.js + Express

**AI 服务**
| 服务 | 用途 |
|------|------|
| DeepSeek API | 对话生成 + Function Calling |
| 火山方舟 豆包视觉模型 | 作业图片识别 |
| 火山引擎 TTS | 语音合成 |

## Agent 能力（Coach 模式）

```
用户消息 → DeepSeek API (tools 参数)
                │
          ┌─────┴─────┐
          │ tool_calls │  ← AI 自主决定是否调用工具
          └─────┬─────┘
                │
      ┌─────────┼─────────┐
      ▼         ▼         ▼
 generateQuiz  checkProgress  suggestResources
 (生成练习题)   (评估进度)      (推荐资源)
      │         │         │
      └─────────┼─────────┘
                ▼
    工具结果 → DeepSeek API (第二轮流式请求)
                ▼
          SSE 流式响应 → 前端渲染
```

**状态管理**：后端维护 Plan JSON 对象，追踪学习目标、步骤进度、完成状态。AI 通过 PLAN_UPDATE 指令驱动状态流转（create → advance → revise → complete）。

**工具调用日志**：`GET /tools/log/:sessionId` 可查看 AI 调了什么工具、参数、次数。

## 架构

```
┌─────────────┐       SSE        ┌─────────────────┐
│  React 前端  │ ◄──────────────► │  Express 后端    │
│  (Vercel)   │                  │  (Render)        │
└─────────────┘                  └────────┬────────┘
                                          │
                        ┌─────────────────┼─────────────────┐
                        ▼                 ▼                 ▼
                  DeepSeek API     豆包视觉模型      火山引擎 TTS
                 (对话 + Tools)    (图片识别)        (语音合成)
```

## 核心功能

| 功能 | 说明 |
|------|------|
| 流式对话 | SSE 逐 token 推送，打字机效果 |
| Agent 工具调用 | AI 自主决定何时调用 generateQuiz / checkProgress / suggestResources |
| 学习计划管理 | 结构化 Plan 状态机，前端实时展示进度 |
| 多角色系统 | Tutor（引导式）、Mentor（作业反馈）、Coach（Agent 规划） |
| 防幻觉机制 | Prompt 学科边界约束 + 上下文焦点管理 + DeepSeek × 豆包跨模型交叉验证 |
| 图片识别 | 粘贴/上传作业图片，视觉模型生成反馈 |
| TTS 语音合成 | 点击朗读 AI 回复，英文内容自动隐藏 |
| PWA 支持 | 可安装到桌面/手机，Service Worker 离线缓存静态资源 |
| 会话隔离 | 按 sessionId 独立上下文，24h 过期 |
| Markdown 渲染 | 代码块、列表、表格完整支持 |

## 本地运行

### 前置条件

- Node.js >= 18
- DeepSeek API Key
- （可选）火山引擎 TTS / 火山方舟视觉模型凭证

### 步骤

```bash
# 克隆
git clone https://github.com/shona-duan/AI-Partner-for-Teenager.git
cd AI-Partner-for-Teenager

# 后端
npm install
cp .env.example .env.local
# 编辑 .env.local 填入 API Key

# 前端
cd client && npm install

# 启动后端（端口 3001）
cd .. && npm start

# 启动前端（另开终端，端口 5173）
cd client && npm run dev
```

浏览器打开 `http://localhost:5173`

### 环境变量

```env
DEEPSEEK_API_KEY=DeepSeek API Key
VOLC_APPID=火山引擎 TTS AppID（可选）
VOLC_TOKEN=火山引擎 TTS Token（可选）
VOLC_VISION_API_KEY=火山方舟视觉模型 API Key（可选）
VOLC_VISION_MODEL=火山方舟视觉模型 Model ID（可选）
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/chat` | 非流式对话 + TTS |
| POST | `/chat/stream` | 流式对话（SSE），Coach 模式含 Function Calling |
| POST | `/chat/image` | 图片上传 + 视觉分析 + 流式反馈 |
| GET | `/plan/:sessionId` | 获取学习计划状态 |
| GET | `/tools/log/:sessionId` | 获取工具调用日志 |

## License

MIT
