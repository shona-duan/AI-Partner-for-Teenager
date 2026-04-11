// require("dotenv").config();
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env.local") });

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();

// --- 会话内存（按 sessionId 隔离）---
const sessionMessages = new Map();
const SESSION_EXPIRE_MS = 24 * 60 * 60 * 1000; // 24小时

// --- 1. 配置区（从 .env.local 读取） ---
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const VOLC_APPID = process.env.VOLC_APPID;
const VOLC_TOKEN = process.env.VOLC_TOKEN;

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

// --- 4. 启动与清理 ---
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
