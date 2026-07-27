import { useState, useCallback, useRef } from "react";
import type { Message, TeacherRole } from "../types";

// 生成简易 ID
function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function useStreamChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string>(genId());

  const send = useCallback(
    async (content: string, role: TeacherRole, imageFiles?: File[]) => {
      // 如果有图片，走图片上传接口
      if (imageFiles && imageFiles.length > 0) {
        await sendWithImage(content, role, imageFiles);
        return;
      }

      const userMsg: Message = {
        id: genId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      const assistantMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            sessionId: sessionIdRef.current,
            role,
          }),
          signal: controller.signal,
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) throw new Error("无法读取响应流");

        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);
            if (data === "[DONE]") break;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.content) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? { ...m, content: m.content + parsed.content }
                      : m,
                  ),
                );
              }
            } catch {
              // 忽略解析错误
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: "⚠️ 连接出错，请稍后重试" }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [],
  );

  // 图片上传 + 反馈（Mentor 模式）
  async function sendWithImage(
    content: string,
    role: TeacherRole,
    imageFiles: File[],
  ) {
    const imageUrls = imageFiles.map((f) => URL.createObjectURL(f));

    const userMsg: Message = {
      id: genId(),
      role: "user",
      content: content || "请帮我看看这份作业",
      imageUrl: imageUrls[0],
      timestamp: Date.now(),
    };

    const assistantMsg: Message = {
      id: genId(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const formData = new FormData();
    imageFiles.forEach((file) => formData.append("images", file));
    formData.append("message", content || "请帮我看看这份作业，给出具体的反馈和改进建议");
    formData.append("sessionId", sessionIdRef.current);
    formData.append("role", role);

    try {
      const res = await fetch("/chat/image", {
        method: "POST",
        body: formData,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("无法读取响应流");

      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") break;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: `⚠️ ${parsed.error}` }
                    : m,
                ),
              );
              return;
            }
            if (parsed.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: m.content + parsed.content }
                    : m,
                ),
              );
            }
          } catch {
            // 忽略
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: "⚠️ 图片上传失败，请稍后重试" }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    sessionIdRef.current = genId();
  }, []);

  return { messages, isStreaming, send, stop, clear };
}
