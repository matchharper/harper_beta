import {
  BadgeCheck,
  Ban,
  Flag,
  Handshake,
  Inbox,
  type LucideIcon,
  Send,
  UserPlus,
} from "lucide-react";
import type { OrgStage } from "@/lib/org/server";

/**
 * One icon per pipeline column, shared by the decision dialogs and the
 * candidate's progress line so the same place always looks the same.
 */
export function orgStageIcon(stage: string): LucideIcon {
  if (stage === "company_intro") return UserPlus;
  if (stage === "intro_requested") return Send;
  if (stage === "pending_connection") return Inbox;
  if (stage === "connected") return Handshake;
  if (stage === "final_offer") return BadgeCheck;
  if (stage === "process_stopped") return Ban;
  return Flag;
}

type Copy = (ko: string, en: string) => string;

/** The pipeline column name as the board shows it, without the Role prefix. */
export function orgStageName(
  stage: string,
  c: Copy,
  stages: readonly Pick<OrgStage, "id" | "label">[] = [],
  roleTitle = ""
) {
  const fixed: Record<string, string> = {
    company_intro: c("연결 제안할 후보", "Suggested candidates"),
    connected: c("연결됨", "Connected"),
    final_offer: c("최종 오퍼", "Final offer"),
    intro_requested: c("연결 제안한 후보", "Intro requested"),
    pending_connection: c("연결 수락한 후보", "Ready to connect"),
    process_stopped: c("프로세스 중단", "Process ended"),
  };
  if (fixed[stage]) return fixed[stage];
  const label = stages.find((item) => item.id === stage)?.label.trim() ?? "";
  const prefix = `${roleTitle.trim()} · `;
  return roleTitle.trim() && label.startsWith(prefix)
    ? label.slice(prefix.length)
    : label;
}
