// require("dotenv").config();
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env.local") });

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");

const app = express();

// --- 会话内存（按 sessionId 隔离）---
const sessionMessages = new Map();
const SESSION_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24小时

// --- Agent 状态管理（Coach 模式的学习计划）---
const sessionPlans = new Map();

// --- 图片上传配置 ---
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- 1. 配置区（从 .env.local 读取） ---
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const VOLC_APPID = process.env.VOLC_APPID;
const VOLC_TOKEN = process.env.VOLC_TOKEN;
const VOLC_VISION_API_KEY = process.env.VOLC_VISION_API_KEY; // 火山方舟 API Key
const VOLC_VISION_MODEL = process.env.VOLC_VISION_MODEL; // 豆包视觉模型名称

if (!DEEPSEEK_API_KEY || !VOLC_APPID || !VOLC_TOKEN) {
  console.error("❌ 请检查 .env.local 配置，缺少必要的 API KEY");
}

// --- 2. CORS / 预检兜底 ---
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, ngrok-skip-browser-warning",
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// --- 解析 JSON body（给 POST 接口用） ---
app.use(express.json());

// --- 3. 静态资源配置 ---
// const audioFolder = path.join(__dirname, "public/audio");
// if (!fs.existsSync(audioFolder)) {
//   fs.mkdirSync(audioFolder, { recursive: true });
// }
// app.use("/audio", express.static(audioFolder));
const publicFolder = path.join(__dirname, "public");
const audioFolder = path.join(publicFolder, "audio");

if (!fs.existsSync(audioFolder)) {
  fs.mkdirSync(audioFolder, { recursive: true });
}

// 托管整个 public 目录
app.use(express.static(publicFolder));

// 单独暴露音频目录（其实上一句已经覆盖，这里保留也没问题）
app.use("/audio", express.static(audioFolder));

// --- 4. 首页路由（可选，但推荐保留） ---
app.get("/", (req, res) => {
  res.sendFile(path.join(publicFolder, "index.html"));
});

// --- 5. 核心 GET 接口 ---
app.get("/chat", async (req, res) => {
  try {
    const userMsg = req.query.message;
    const voiceType = req.query.voice || "zh_female_linjianvhai_moon_bigtts";
    const rawSessionId = req.query.sessionId;
    const sessionId =
      typeof rawSessionId === "string" && rawSessionId.trim()
        ? rawSessionId.trim()
        : "default_session";

    if (!userMsg) {
      return res.json({ reply: "你还没跟我说话呢~", audioUrl: "" });
    }

    // 初始化/读取当前会话历史
    const existingSession = sessionMessages.get(sessionId);
    const now = Date.now();

    if (
      !existingSession ||
      now - existingSession.updatedAt > SESSION_EXPIRE_MS
    ) {
      sessionMessages.set(sessionId, {
        messages: [
          {
            role: "system",
            content:
              "你是一只小学生的AI伙伴，说话语气要适应小学高年级学生和初中生，回答简短有趣，控制在100字以内。",
          },
        ],
        updatedAt: now,
      });
    }

    const sessionData = sessionMessages.get(sessionId);

    // 【优化】动态获取当前请求的协议和域名（解决 ngrok 地址变动问题）
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.get("host");
    const currentBaseUrl = `${protocol}://${host}`;

    console.log(`[收到消息]: ${userMsg}`);

    // --- 步骤 A: 调用 DeepSeek ---
    // 修正：DeepSeek 标准地址通常不带 v1，这里改用更通用的 endpoint
    const dsResponse = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [...sessionData.messages, { role: "user", content: userMsg }],
      },
      {
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      },
    );

    const aiReply = dsResponse.data.choices[0].message.content;

    // 更新当前会话历史，保留最近 20 条消息（不含 system）
    const nonSystemMessages = sessionData.messages.filter(
      (message) => message.role !== "system",
    );
    nonSystemMessages.push({ role: "user", content: userMsg });
    nonSystemMessages.push({ role: "assistant", content: aiReply });

    const trimmedMessages = nonSystemMessages.slice(-20);
    sessionData.messages = [sessionData.messages[0], ...trimmedMessages];
    sessionData.updatedAt = now;

    // --- 步骤 B: 调用火山引擎 TTS (终极成功版) ---
    const audioFileName = `${uuidv4()}.mp3`;
    const audioPath = path.join(audioFolder, audioFileName);

    console.log(`正在合成语音... 使用音色: ${voiceType}`);

    const ttsResponse = await axios.post(
      "https://openspeech.bytedance.com/api/v1/tts",
      {
        app: {
          appid: VOLC_APPID,
          token: VOLC_TOKEN,
          cluster: "volcano_tts", // 请保持你测试成功的 cluster
        },
        user: { uid: "student_demo" },
        audio: {
          voice_type: voiceType, // 请保持你测试成功的高级音色 ID
          encoding: "mp3",
        },
        request: {
          text: aiReply,
          reqid: uuidv4(),
          operation: "query",
        },
      },
      {
        // 关键修改 1：告诉 axios 我们要接收 JSON 纸箱子，而不是直接存二进制
        responseType: "json",
        headers: {
          Authorization: `Bearer;${VOLC_TOKEN}`,
          "Content-Type": "application/json",
        },
      },
    );

    // 关键修改 2：开始“拆快递”
    if (ttsResponse.data.code === 3000) {
      // 1. 从纸箱子里拿出那串超长的文本 (Base64)
      const audioBase64 = ttsResponse.data.data;

      // 2. 用 Node.js 自带的 Buffer 工具，把文本变回真正的 MP3 声音流
      const audioBuffer = Buffer.from(audioBase64, "base64");

      // 3. 把真正的声音流存入硬盘
      fs.writeFileSync(audioPath, audioBuffer);

      console.log(`✅ 真正的语音文件已成功保存: ${audioFileName} !`);
    } else {
      console.error("❌ 火山返回了异常状态:", ttsResponse.data.message);
      throw new Error("TTS 合成失败");
    }

    // --- 步骤 C: 返回 JSON 给 TurboWarp ---

    res.json({
      reply: aiReply,
      audioUrl: `${currentBaseUrl}/audio/${audioFileName}`, // 使用自动生成的 URL
      sessionId,
    });

    console.log(`[已回复]: ${aiReply}`);
  } catch (err) {
    // 增强错误日志，方便你调试
    const errorDetail = err.response
      ? JSON.stringify(err.response.data)
      : err.message;
    console.error("服务器报错了:", errorDetail);
    res.json({
      reply: "哎呀，我的大脑短路了，请检查网络或稍后再试！",
      audioUrl: "",
    });
  }
});

// --- 6. 流式聊天接口（React 前端用） ---
const ROLE_PROMPTS = {
  tutor: `你是一位耐心的学科辅导老师。你的教学方法：
- 不直接给答案，用提问引导学生自己思考
- 根据学生的回答判断理解程度，动态调整解释深度
- 用生活中的例子和类比帮助理解抽象概念
- 分步骤讲解，每一步确认学生理解后再继续
- 如果学生卡住了，给一个小提示而不是直接揭晓答案
- 学生答对时给予鼓励，答错时温和引导而不是否定
请用中文回答，语气友好自然，适合中小学生理解。`,

  mentor: `你是一位细致的写作反馈导师。你的工作方法：
- 先仔细阅读学生提交的内容（可能是作文、作业照片的文字描述等）
- 给出具体、有建设性的反馈，而不是笼统评价
- 反馈要平衡：既指出做得好的地方，也指出可以改进的地方
- 改进建议要具体可操作（"第二段可以加一个具体事例" 而不是 "写得更好一些"）
- 如果是图片作业，先描述你看到的内容，再给出反馈
- 最后邀请学生根据建议修改，表达愿意继续帮助的态度
请用中文回答，语气温和鼓励。`,

  coach: `你是一位善于引导反思的学习规划教练，具备任务拆解和状态管理能力。

## 你的教学方法
- 先了解学生当前的学习情况和目标
- 帮助学生拆解大目标为可执行的小步骤
- 引导学生反思：哪些方法有效、哪些需要调整
- 帮助做考试复盘时，关注思维过程而不只是对错
- 制定计划时考虑实际可执行性，不贪多
- 用开放式问题推动学生深入思考

## 计划管理规则
你在对话过程中需要维护一个结构化的学习计划。在每次回复的末尾，用 <!--PLAN_UPDATE:{"action":"..."}-->  标记输出计划更新指令。

可用的 action：
1. "create" — 创建新计划：<!--PLAN_UPDATE:{"action":"create","goal":"目标","steps":[{"title":"步骤名"},{"title":"步骤名"}]}-->
2. "advance" — 推进当前步骤到下一步：<!--PLAN_UPDATE:{"action":"advance","note":"当前步骤的总结笔记"}-->
3. "update_step" — 更新某步骤状态：<!--PLAN_UPDATE:{"action":"update_step","stepIndex":0,"status":"done","note":"笔记"}-->
4. "revise" — 修改计划（加减步骤）：<!--PLAN_UPDATE:{"action":"revise","steps":[{"title":"新步骤1"},{"title":"新步骤2"}]}-->
5. "complete" — 标记计划完成：<!--PLAN_UPDATE:{"action":"complete","summary":"总结"}-->
6. 无需更新时不输出此标记

## 状态流转
- 新对话且无计划时：引导学生说出学习目标，然后用 create 创建计划
- 有计划进行中：根据对话内容判断是否推进、调整或完成
- 一次只推进一个步骤，确认学生掌握后再前进

## 工具使用
你有以下工具可以调用（系统会自动执行）：
- generateQuiz：当学生需要练习或检验掌握程度时，生成针对性练习题
- checkProgress：当你需要评估学生是否掌握当前步骤时使用
- suggestResources：当学生某个知识点薄弱、需要额外练习方向时使用

使用原则：
- 不要每次都调用工具，只在教学需要时调用
- 先和学生对话了解情况，觉得需要检测或出题时再调用
- 调用工具后，基于工具返回的结果组织回复内容

请用中文回答，像一个了解你的学长/学姐那样交流。不要让学生看到 PLAN_UPDATE 标记的存在。`,

  // 兼容旧接口的角色
  math: "你是一位耐心的数学老师，擅长用生活中的例子解释数学概念。回答时分步骤讲解，鼓励学生思考。",
  english: "你是一位活泼的英语老师，擅长用中英对照的方式教学。适当穿插英文例句，帮助学生理解语境。",
  science: "你是一位好奇心旺盛的科学老师，喜欢用实验和现象引导学生探索科学原理。回答生动有趣。",
  general: "你是一位友善的AI学习伙伴，回答简洁清晰，适合小学高年级和初中生理解。",
};

// --- Plan 解析与状态管理工具函数 ---

// --- Function Calling 工具定义 ---
const COACH_TOOLS = [
  {
    type: "function",
    function: {
      name: "generateQuiz",
      description: "根据当前学习步骤生成练习题，用于检测学生对知识点的掌握程度",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "练习题的知识点主题" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"], description: "难度等级" },
          count: { type: "integer", description: "生成题目数量，1-5之间" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "checkProgress",
      description: "评估学生在当前学习步骤的掌握程度，基于对话历史判断是否可以推进到下一步",
      parameters: {
        type: "object",
        properties: {
          stepTitle: { type: "string", description: "要评估的学习步骤名称" },
          evidence: { type: "string", description: "学生掌握或未掌握的证据描述" },
        },
        required: ["stepTitle", "evidence"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggestResources",
      description: "根据学生薄弱点推荐学习资源或练习方向",
      parameters: {
        type: "object",
        properties: {
          weakPoint: { type: "string", description: "学生的薄弱知识点" },
          currentLevel: { type: "string", enum: ["beginner", "intermediate", "advanced"], description: "当前水平" },
        },
        required: ["weakPoint"],
      },
    },
  },
];

// --- 工具执行函数 ---
const toolCallLog = new Map();

function executeToolCall(sessionId, toolName, args) {
  // 记录调用日志
  if (!toolCallLog.has(sessionId)) toolCallLog.set(sessionId, []);
  toolCallLog.get(sessionId).push({
    tool: toolName,
    args,
    timestamp: Date.now(),
  });

  switch (toolName) {
    case "generateQuiz":
      return JSON.stringify({
        action: "generateQuiz",
        topic: args.topic,
        difficulty: args.difficulty || "medium",
        count: args.count || 3,
        instruction: `请根据以下要求生成练习题：主题「${args.topic}」，难度「${args.difficulty || "medium"}」，数量 ${args.count || 3} 道。每道题给出题目和参考答案，格式清晰。`,
      });

    case "checkProgress":
      return JSON.stringify({
        action: "checkProgress",
        stepTitle: args.stepTitle,
        evidence: args.evidence,
        instruction: `请根据以下信息评估学生掌握程度：步骤「${args.stepTitle}」，证据：${args.evidence}。给出掌握程度评分(1-10)和是否建议推进到下一步。`,
      });

    case "suggestResources":
      return JSON.stringify({
        action: "suggestResources",
        weakPoint: args.weakPoint,
        currentLevel: args.currentLevel || "beginner",
        instruction: `学生在「${args.weakPoint}」方面比较薄弱，当前水平：${args.currentLevel || "beginner"}。请推荐 2-3 个具体的练习方向或学习建议。`,
      });

    default:
      return JSON.stringify({ error: "未知工具" });
  }
}

// --- 获取工具调用日志 ---
app.get("/tools/log/:sessionId", (req, res) => {
  const log = toolCallLog.get(req.params.sessionId) || [];
  res.json({ calls: log, totalCalls: log.length });
});
function parsePlanUpdate(text) {
  const match = text.match(/<!--PLAN_UPDATE:(.*?)-->/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    console.warn("Plan 更新指令解析失败:", match[1]);
    return null;
  }
}

function applyPlanUpdate(sessionId, update) {
  let plan = sessionPlans.get(sessionId);

  switch (update.action) {
    case "create":
      plan = {
        goal: update.goal,
        phase: "in_progress",
        currentStep: 0,
        steps: (update.steps || []).map((s) => ({
          title: s.title,
          status: "pending",
          note: "",
        })),
        createdAt: Date.now(),
      };
      if (plan.steps.length > 0) plan.steps[0].status = "in_progress";
      break;

    case "advance":
      if (!plan) return;
      if (plan.currentStep < plan.steps.length) {
        plan.steps[plan.currentStep].status = "done";
        plan.steps[plan.currentStep].note = update.note || "";
      }
      plan.currentStep++;
      if (plan.currentStep < plan.steps.length) {
        plan.steps[plan.currentStep].status = "in_progress";
      }
      break;

    case "update_step":
      if (!plan) return;
      const idx = update.stepIndex;
      if (idx >= 0 && idx < plan.steps.length) {
        plan.steps[idx].status = update.status || plan.steps[idx].status;
        if (update.note) plan.steps[idx].note = update.note;
      }
      break;

    case "revise":
      if (!plan) return;
      const doneSteps = plan.steps.filter((s) => s.status === "done");
      const newSteps = (update.steps || []).map((s) => ({
        title: s.title,
        status: "pending",
        note: "",
      }));
      plan.steps = [...doneSteps, ...newSteps];
      plan.currentStep = doneSteps.length;
      if (plan.currentStep < plan.steps.length) {
        plan.steps[plan.currentStep].status = "in_progress";
      }
      break;

    case "complete":
      if (!plan) return;
      plan.phase = "completed";
      plan.steps.forEach((s) => { if (s.status !== "done") s.status = "done"; });
      plan.summary = update.summary || "";
      plan.completedAt = Date.now();
      break;

    default:
      return;
  }

  sessionPlans.set(sessionId, plan);
  console.log(`[Plan 更新] session=${sessionId}, action=${update.action}`);
}

// --- 获取当前计划状态的 API ---
app.get("/plan/:sessionId", (req, res) => {
  const plan = sessionPlans.get(req.params.sessionId);
  res.json({ plan: plan || null });
});

// --- 流式响应处理（抽取为公共函数）---
function handleStreamResponse(response, res, sessionData, sessionId, role, message) {
  let fullReply = "";
  let buffer = "";

  response.data.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);
      if (data === "[DONE]") {
        return;
      }

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullReply += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  });

  response.data.on("end", () => {
    // 处理 buffer 中剩余数据
    if (buffer.trim().startsWith("data: ") && buffer.trim().slice(6) !== "[DONE]") {
      try {
        const parsed = JSON.parse(buffer.trim().slice(6));
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullReply += content;
          res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }
      } catch {
        // 忽略
      }
    }

    // Coach 模式：解析 Plan 更新指令
    if (role === "coach") {
      const planUpdate = parsePlanUpdate(fullReply);
      if (planUpdate) {
        applyPlanUpdate(sessionId, planUpdate);
        const updatedPlan = sessionPlans.get(sessionId);
        if (updatedPlan) {
          res.write(`data: ${JSON.stringify({ planUpdate: updatedPlan })}\n\n`);
        }
      }
    }

    // 更新会话历史（存储时去掉 PLAN_UPDATE 标记）
    const cleanReply = fullReply.replace(/<!--PLAN_UPDATE:.*?-->/gs, "").trim();
    const nonSystem = sessionData.messages.filter((m) => m.role !== "system");
    nonSystem.push({ role: "user", content: message });
    nonSystem.push({ role: "assistant", content: cleanReply });
    sessionData.messages = [sessionData.messages[0], ...nonSystem.slice(-20)];
    sessionData.updatedAt = Date.now();

    res.write("data: [DONE]\n\n");
    res.end();
  });

  response.data.on("error", (err) => {
    console.error("流式读取出错:", err.message);
    res.write(`data: ${JSON.stringify({ error: "流式传输中断" })}\n\n`);
    res.end();
  });
}

app.post("/chat/stream", async (req, res) => {
  const { message, sessionId = "default", role = "general" } = req.body;

  if (!message) {
    return res.status(400).json({ error: "message 不能为空" });
  }

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // 获取或初始化会话
  const now = Date.now();
  const existing = sessionMessages.get(sessionId);

  if (!existing || now - existing.updatedAt > SESSION_EXPIRE_MS) {
    sessionMessages.set(sessionId, {
      messages: [
        { role: "system", content: ROLE_PROMPTS[role] || ROLE_PROMPTS.general },
      ],
      updatedAt: now,
    });
  }

  const sessionData = sessionMessages.get(sessionId);

  // 如果角色切换了，更新 system prompt
  const currentSystemPrompt = ROLE_PROMPTS[role] || ROLE_PROMPTS.general;

  // Coach 模式：注入当前 Plan 状态到 system prompt
  let systemWithPlan = currentSystemPrompt;
  if (role === "coach") {
    const plan = sessionPlans.get(sessionId);
    if (plan) {
      systemWithPlan += `\n\n## 当前学习计划状态\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\`\n请基于此计划状态继续引导学生。`;
    } else {
      systemWithPlan += `\n\n## 当前状态\n学生尚未创建学习计划。请先了解学生的学习目标，然后帮助创建计划。`;
    }
  }

  sessionData.messages[0] = { role: "system", content: systemWithPlan };

  try {
    const userMessages = [...sessionData.messages, { role: "user", content: message }];

    // Coach 模式：先用非流式请求检测是否需要调用工具
    if (role === "coach") {
      const toolCheckResponse = await axios.post(
        "https://api.deepseek.com/v1/chat/completions",
        {
          model: "deepseek-chat",
          messages: userMessages,
          tools: COACH_TOOLS,
          tool_choice: "auto",
        },
        {
          headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
        },
      );

      const assistantMessage = toolCheckResponse.data.choices[0].message;

      // 如果 AI 决定调用工具
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log(`[Tool Call] session=${sessionId}, tools=${assistantMessage.tool_calls.map(t => t.function.name).join(",")}`);

        // 通知前端正在调用工具
        const toolNames = assistantMessage.tool_calls.map(t => t.function.name);
        res.write(`data: ${JSON.stringify({ toolCall: toolNames })}\n\n`);

        // 执行所有工具调用，收集结果
        const toolMessages = assistantMessage.tool_calls.map((tc) => {
          const args = JSON.parse(tc.function.arguments);
          const result = executeToolCall(sessionId, tc.function.name, args);
          return {
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          };
        });

        // 第二轮：带工具结果的流式请求
        const streamMessages = [
          ...userMessages,
          assistantMessage,
          ...toolMessages,
        ];

        const response = await axios.post(
          "https://api.deepseek.com/v1/chat/completions",
          {
            model: "deepseek-chat",
            messages: streamMessages,
            stream: true,
          },
          {
            headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
            responseType: "stream",
          },
        );

        handleStreamResponse(response, res, sessionData, sessionId, role, message);
        req.on("close", () => { response.data.destroy(); });
        return;
      }

      // AI 没有调用工具但有直接回复内容 → 当作普通流式处理
    }

    // 普通流式请求（非 Coach 或 Coach 未触发工具）
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: userMessages,
        stream: true,
      },
      {
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
        responseType: "stream",
      },
    );

    handleStreamResponse(response, res, sessionData, sessionId, role, message);
    req.on("close", () => { response.data.destroy(); });
  } catch (err) {
    const errorDetail = err.response
      ? JSON.stringify(err.response.data)
      : err.message;
    console.error("流式接口报错:", errorDetail);
    res.write(`data: ${JSON.stringify({ error: "AI 服务暂时不可用" })}\n\n`);
    res.end();
  }
});

// --- 7. 图片上传 + 视觉分析接口（Mentor 模式用，支持最多 5 张图） ---
app.post("/chat/image", upload.array("images", 5), async (req, res) => {
  const { message = "请帮我看看这份作业", sessionId = "default", role = "mentor" } = req.body;
  const imageFiles = req.files;

  if (!imageFiles || imageFiles.length === 0) {
    return res.status(400).json({ error: "请上传图片" });
  }

  // 检查视觉模型配置
  if (!VOLC_VISION_API_KEY || !VOLC_VISION_MODEL) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ error: "视觉模型尚未配置。请在 .env.local 中设置 VOLC_VISION_API_KEY 和 VOLC_VISION_MODEL" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  // 设置 SSE 响应头
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    // 构建多图 input content 数组（火山方舟新版 API 格式）
    const imageContents = imageFiles.map((file) => ({
      type: "input_image",
      image_url: `data:${file.mimetype || "image/png"};base64,${file.buffer.toString("base64")}`,
    }));

    // 步骤1：调用豆包视觉模型识别所有图片内容
    const visionResponse = await axios.post(
      `https://ark.cn-beijing.volces.com/api/v3/responses`,
      {
        model: VOLC_VISION_MODEL,
        input: [
          {
            role: "user",
            content: [
              ...imageContents,
              { type: "input_text", text: `这里有 ${imageFiles.length} 张图片，请仔细识别每张图片中的所有文字内容和题目，完整还原。如果有手写内容也请尽量识别。按图片顺序分别列出。` },
            ],
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${VOLC_VISION_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    // 新版 API 响应格式：output[].content[].text
    const outputItems = visionResponse.data.output || [];
    const recognizedContent = outputItems
      .filter((item) => item.type === "message" && item.role === "assistant")
      .map((item) => item.content?.map((c) => c.text).join("") || "")
      .join("\n") || "无法识别图片内容";

    // 步骤2：把识别结果 + 用户指令发给 DeepSeek 生成教学反馈（流式）
    const systemPrompt = ROLE_PROMPTS[role] || ROLE_PROMPTS.mentor;
    const fullMessage = `学生上传了 ${imageFiles.length} 张作业图片，以下是图片中识别出的内容：\n\n---\n${recognizedContent}\n---\n\n学生的问题/要求：${message}\n\n请根据以上内容给出具体的反馈和建议。`;

    const streamResponse = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: fullMessage },
        ],
        stream: true,
      },
      {
        headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
        responseType: "stream",
      },
    );

    let buffer = "";

    streamResponse.data.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          res.write("data: [DONE]\n\n");
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ content })}\n\n`);
          }
        } catch {
          // 忽略
        }
      }
    });

    streamResponse.data.on("end", () => {
      res.write("data: [DONE]\n\n");
      res.end();
    });

    streamResponse.data.on("error", (err) => {
      console.error("图片反馈流式读取出错:", err.message);
      res.write(`data: ${JSON.stringify({ error: "流式传输中断" })}\n\n`);
      res.end();
    });

    req.on("close", () => {
      streamResponse.data.destroy();
    });
  } catch (err) {
    const errorDetail = err.response ? JSON.stringify(err.response.data) : err.message;
    console.error("图片接口报错:", errorDetail);
    res.write(`data: ${JSON.stringify({ error: "图片分析服务暂时不可用" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// --- 8. 启动与清理 ---
const PORT = 3001;
app.listen(PORT, () => {
  console.log("========================================");
  console.log(`🚀 AI 教学后端启动成功！监听端口: ${PORT}`);
  console.log(`💡 提示: 请确保 ngrok 已经启动并指向该端口`);
  console.log("========================================");
});

setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of sessionMessages.entries()) {
      if (now - value.updatedAt > SESSION_EXPIRE_MS) {
        sessionMessages.delete(key);
        sessionPlans.delete(key);
        console.log(`[自动清理]: 已删除过期会话 ${key}`);
      }
    }
  },
  60 * 60 * 1000,
);

setInterval(() => {
  const now = Date.now();
  const files = fs.readdirSync(audioFolder);
  files.forEach((file) => {
    const filePath = path.join(audioFolder, file);
    if (file.endsWith(".mp3")) {
      // 只清理 mp3，不误伤其他文件
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > 3600000) {
        fs.unlinkSync(filePath);
        console.log(`[自动清理]: 已删除过期语音文件 ${file}`);
      }
    }
  });
}, 600000);
