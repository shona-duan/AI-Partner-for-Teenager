// 消息类型
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  // 图片附件（Mentor 模式用，第一张预览）
  imageUrl?: string;
  // 防幻觉：交叉验证状态
  verification?: "verifying" | "passed" | "conflict" | "skipped";
  verificationNote?: string;
  timestamp: number;
}

// 学习计划（Agent 状态管理）
export interface PlanStep {
  title: string;
  status: "pending" | "in_progress" | "done";
  note: string;
}

export interface LearningPlan {
  goal: string;
  phase: "in_progress" | "completed";
  currentStep: number;
  steps: PlanStep[];
  createdAt: number;
  summary?: string;
  completedAt?: number;
}

// 教学角色
export type TeacherRole = "tutor" | "mentor" | "coach";

export interface RoleConfig {
  id: TeacherRole;
  label: string;
  description: string;
  icon: string;
}

export const ROLES: RoleConfig[] = [
  {
    id: "tutor",
    label: "学科辅导",
    description: "不直接给答案，用提问引导你思考",
    icon: "📚",
  },
  {
    id: "mentor",
    label: "作业反馈",
    description: "上传作业照片，获得具体改进建议",
    icon: "✍️",
  },
  {
    id: "coach",
    label: "学习规划",
    description: "帮你做学习计划、考试复盘",
    icon: "🎯",
  },
];
