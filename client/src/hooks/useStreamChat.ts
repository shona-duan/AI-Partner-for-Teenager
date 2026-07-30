import { useState, useCallback, useRef } from "react";
import type { Message, TeacherRole, LearningPlan } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const TOOL_NAME_MAP: Record<string, string> = {
  generateQuiz: "生成练习题",
  checkProgress: "评估学习进度",
  suggestResources: "推荐学习资源",
};

type RoleState = {
  messages: Message[];
  plan: LearningPlan | null;
  sessionId: string;
};

function createRoleState(): RoleState {
  return { messages: [], plan: null, sessionId: genId() };
}

export function useStreamChat(currentRole: TeacherRole) {
  const [roleStates, setRoleStates] = useState<Record<TeacherRole, RoleState>>({
    tutor: createRoleState(),
    mentor: createRoleState(),
    coach: createRoleState(),
  });
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const currentState = roleStates[currentRole];
  const messages = currentState.messages;
  const plan = currentState.plan;

  const setMessages = (updater: (prev: Message[]) => Message[]) => {
    setRoleStates((prev) => ({
      ...prev,
      [currentRole]: {
        ...prev[currentRole],
        messages: updater(prev[currentRole].messages),
      },
    }));
  };

  const setPlan = (newPlan: LearningPlan | null) => {
    setRoleStates((prev) => ({
      ...prev,
      [currentRole]: { ...prev[currentRole], plan: newPlan },
    }));
  };

  const send = useCallback(
    async (content: string, role: TeacherRole, imageFiles?: File[]) => {
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
        const res = await fetch(`${API_BASE}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            sessionId: roleStates[role].sessionId,
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
              if (parsed.toolCall) {
                setActiveTools(parsed.toolCall);
                continue;
              }
              if (parsed.planUpdate) {
                setPlan(parsed.planUpdate);
                continue;
              }
              if (parsed.verification) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsg.id
                      ? {
                          ...m,
                          verification: parsed.verification === "start" ? "verifying" : parsed.verification,
                          verificationNote: parsed.note || (parsed.verification === "conflict" ? `主模型: ${parsed.mainAnswer} | 验证模型: ${parsed.doubaoAnswer}` : undefined),
                        }
                      : m,
                  ),
                );
                continue;
              }
              if (parsed.content) {
                setActiveTools([]);
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
        setActiveTools([]);
        abortRef.current = null;
      }
    },
    [roleStates, currentRole],
  );

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
    formData.append("sessionId", roleStates[role].sessionId);
    formData.append("role", role);

    try {
      const res = await fetch(`${API_BASE}/chat/image`, {
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
    setRoleStates((prev) => ({
      ...prev,
      [currentRole]: createRoleState(),
    }));
    setPlan(null);
  }, [currentRole]);

  return { messages, isStreaming, plan, activeTools, TOOL_NAME_MAP, send, stop, clear };
}
