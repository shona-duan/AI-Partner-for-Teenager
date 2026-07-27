import type { TeacherRole } from "../types";
import MessageList from "./MessageList";
import InputBar from "./InputBar";
import RoleSelector from "./RoleSelector";
import { useStreamChat } from "../hooks/useStreamChat";
import "./ChatPanel.css";

interface Props {
  currentRole: TeacherRole;
  onRoleChange: (role: TeacherRole) => void;
}

export default function ChatPanel({ currentRole, onRoleChange }: Props) {
  const { messages, isStreaming, send, stop, clear } = useStreamChat();

  const handleRoleChange = (role: TeacherRole) => {
    onRoleChange(role);
    clear();
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h1 className="chat-title">AI 学习助手</h1>
        <button className="clear-btn" onClick={clear} title="清空对话">
          🗑️
        </button>
      </div>
      <RoleSelector current={currentRole} onChange={handleRoleChange} />
      <MessageList messages={messages} />
      <InputBar
        onSend={send}
        isStreaming={isStreaming}
        onStop={stop}
        currentRole={currentRole}
      />
    </div>
  );
}
