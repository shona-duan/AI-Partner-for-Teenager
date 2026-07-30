import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../types";
import "./MessageBubble.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";

interface Props {
  message: Message;
}

// 过滤掉 AI 回复中的内部标记
function cleanContent(content: string) {
  return content.replace(/<!--PLAN_UPDATE:.*?-->/gs, "").trim();
}

// 检测内容是否包含大量英文（超过 40% 为英文字符则判定为英文内容）
function isEnglishHeavy(text: string): boolean {
  const cleaned = text.replace(/[^a-zA-Z一-鿿]/g, "");
  if (!cleaned) return false;
  const englishChars = cleaned.replace(/[^a-zA-Z]/g, "").length;
  return englishChars / cleaned.length > 0.4;
}

// 思考中指示器（带计时）
function ThinkingIndicator() {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <div className="thinking-indicator">
      <div className="thinking-dots">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
      <span className="thinking-timer">{seconds}s</span>
    </div>
  );
}

// 交叉验证状态指示器
function VerificationBadge({ status, note }: { status: string; note?: string }) {
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === "verifying") {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [status]);

  if (status === "verifying") {
    return (
      <div className="verification-badge verifying">
        <span className="verification-spinner" />
        <span>正在多模型交叉验证中... {seconds}s</span>
      </div>
    );
  }

  if (status === "passed") {
    return (
      <div className="verification-badge passed">
        <span>✓ 已通过多模型交叉验证</span>
      </div>
    );
  }

  if (status === "conflict") {
    return (
      <div className="verification-badge conflict">
        <span>⚠ 多模型答案存在差异，建议与老师确认</span>
        {note && <span className="verification-detail">{note}</span>}
      </div>
    );
  }

  if (status === "skipped") {
    return (
      <div className="verification-badge skipped">
        <span>— {note || "验证已跳过"}</span>
      </div>
    );
  }

  return null;
}

// TTS 播放按钮
function TtsButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  const handleClick = async () => {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("idle");
      return;
    }

    setState("loading");
    try {
      const res = await fetch(`${API_BASE}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const audio = new Audio(`${API_BASE}${data.audioUrl}`);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onerror = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  };

  return (
    <button
      className={`tts-btn ${state}`}
      onClick={handleClick}
      title={state === "playing" ? "停止播放" : "朗读"}
    >
      {state === "loading" ? (
        <span className="tts-spinner" />
      ) : state === "playing" ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" />
          <rect x="14" y="4" width="4" height="16" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.5 4.5 0 002.5-3.5zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z" />
        </svg>
      )}
    </button>
  );
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : cleanContent(message.content);
  const isThinking = !isUser && !displayContent;
  const showTts = !isUser && displayContent && !isEnglishHeavy(displayContent);

  return (
    <div className={`bubble-wrapper ${isUser ? "user" : "assistant"}`}>
      <div className={`bubble ${isUser ? "bubble-user" : "bubble-assistant"}`}>
        {message.imageUrl && (
          <img
            className="bubble-image"
            src={message.imageUrl}
            alt="上传的图片"
          />
        )}
        {isUser ? (
          <p className="bubble-text">{displayContent}</p>
        ) : isThinking ? (
          <ThinkingIndicator />
        ) : (
          <div className="bubble-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayContent}
            </ReactMarkdown>
          </div>
        )}
        {showTts && <TtsButton text={displayContent} />}
        {message.verification && (
          <VerificationBadge status={message.verification} note={message.verificationNote} />
        )}
      </div>
    </div>
  );
}
