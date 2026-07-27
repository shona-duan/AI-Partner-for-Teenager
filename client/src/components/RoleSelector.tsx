import { ROLES, type TeacherRole } from "../types";
import "./RoleSelector.css";

interface Props {
  current: TeacherRole;
  onChange: (role: TeacherRole) => void;
}

export default function RoleSelector({ current, onChange }: Props) {
  return (
    <div className="role-selector">
      {ROLES.map((r) => (
        <button
          key={r.id}
          className={`role-btn ${current === r.id ? "active" : ""}`}
          onClick={() => onChange(r.id)}
          title={r.description}
        >
          <span className="role-icon">{r.icon}</span>
          <span className="role-label">{r.label}</span>
        </button>
      ))}
    </div>
  );
}
