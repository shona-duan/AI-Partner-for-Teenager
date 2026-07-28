import type { LearningPlan } from "../types";
import "./PlanPanel.css";

interface Props {
  plan: LearningPlan;
}

export default function PlanPanel({ plan }: Props) {
  const doneCount = plan.steps.filter((s) => s.status === "done").length;
  const progress = plan.steps.length > 0 ? Math.round((doneCount / plan.steps.length) * 100) : 0;

  return (
    <div className="plan-panel">
      <div className="plan-header">
        <span className="plan-icon">📋</span>
        <span className="plan-goal">{plan.goal}</span>
        {plan.phase === "completed" && <span className="plan-badge-done">已完成</span>}
      </div>
      <div className="plan-progress">
        <div className="plan-progress-bar">
          <div className="plan-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="plan-progress-text">{doneCount}/{plan.steps.length}</span>
      </div>
      <ul className="plan-steps">
        {plan.steps.map((step, i) => (
          <li key={i} className={`plan-step plan-step-${step.status}`}>
            <span className="plan-step-icon">
              {step.status === "done" ? "✅" : step.status === "in_progress" ? "▶️" : "⬜"}
            </span>
            <span className="plan-step-title">{step.title}</span>
            {step.note && <span className="plan-step-note">{step.note}</span>}
          </li>
        ))}
      </ul>
      {plan.summary && (
        <div className="plan-summary">
          <strong>总结：</strong>{plan.summary}
        </div>
      )}
    </div>
  );
}
