import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../types";
import "./MessageBubble.css";

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

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
          <p className="bubble-text">{message.content}</p>
        ) : (
          <div className="bubble-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || "⏳ 思考中..."}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
