import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../types";
import "./MessageBubble.css";

interface Props {
  message: Message;
}

// 过滤掉 AI 回复中的 Plan 更新标记
function cleanContent(content: string) {
  return content.replace(/<!--PLAN_UPDATE:.*?-->/gs, "").trim();
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

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const displayContent = isUser ? message.content : cleanContent(message.content);
  const isThinking = !isUser && !displayContent;

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
      </div>
    </div>
  );
}
