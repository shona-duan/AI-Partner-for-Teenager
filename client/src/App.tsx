import { useState } from "react";
import ChatPanel from "./components/ChatPanel";
import type { TeacherRole } from "./types";

export default function App() {
  const [role, setRole] = useState<TeacherRole>("tutor");

  return <ChatPanel currentRole={role} onRoleChange={setRole} />;
}
