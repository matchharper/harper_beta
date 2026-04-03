import type { AtsSequenceMarkStatus } from "@/lib/ats/shared";

export type AtsSequenceMarkIconKey =
  | "need_email"
  | "find_fail"
  | "ready"
  | "in_sequence"
  | "linkedin_contacted"
  | "waiting_reply"
  | "replied"
  | "paused"
  | "closed";

export type AtsSequenceMarkOption = {
  bgClassName: string;
  description: string;
  iconKey: AtsSequenceMarkIconKey;
  label: string;
  shortLabel: string;
  value: AtsSequenceMarkStatus;
};

export const ATS_SEQUENCE_MARK_OPTIONS: AtsSequenceMarkOption[] = [
  {
    value: "need_email",
    label: "이메일 찾기",
    shortLabel: "Email 찾기",
    description: "이메일 탐색이 아직 필요한 후보자",
    iconKey: "need_email",
    bgClassName: "bg-amber-400/50",
  },
  {
    value: "ready",
    label: "발송 준비",
    shortLabel: "발송 준비",
    description: "이메일 확보 후 발송 준비가 끝난 상태",
    iconKey: "ready",
    bgClassName: "bg-sky-400/50",
  },
  {
    value: "in_sequence",
    label: "시퀀스 진행",
    shortLabel: "진행 중",
    description: "시퀀스가 현재 진행 중인 후보자",
    iconKey: "in_sequence",
    bgClassName: "bg-indigo-400/50",
  },
  {
    value: "linkedin_contacted",
    label: "LinkedIn 연락",
    shortLabel: "LinkedIn",
    description: "메일 대신 LinkedIn으로 먼저 연락한 상태",
    iconKey: "linkedin_contacted",
    bgClassName: "bg-cyan-400/50",
  },
  {
    value: "waiting_reply",
    label: "답장 대기",
    shortLabel: "답장 대기",
    description: "발송 후 답장을 기다리는 상태",
    iconKey: "waiting_reply",
    bgClassName: "bg-violet-400/50",
  },
  {
    value: "replied",
    label: "답장 옴",
    shortLabel: "답장 옴",
    description: "후보자가 답장을 준 상태",
    iconKey: "replied",
    bgClassName: "bg-emerald-400/50",
  },
  {
    value: "paused",
    label: "보류",
    shortLabel: "보류",
    description: "시퀀스를 일시적으로 멈춘 상태",
    iconKey: "paused",
    bgClassName: "bg-orange-400/50",
  },
  {
    value: "closed",
    label: "종료",
    shortLabel: "종료",
    description: "아웃리치를 더 이상 진행하지 않는 상태",
    iconKey: "closed",
    bgClassName: "bg-red-600 text-white",
  },
];

export function getAtsSequenceMarkMeta(
  status: AtsSequenceMarkStatus | null | undefined
) {
  return (
    ATS_SEQUENCE_MARK_OPTIONS.find((option) => option.value === status) ?? null
  );
}
