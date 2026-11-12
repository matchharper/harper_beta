export type CareerBackgroundInvocation = {
  runId: string;
  trigger?: string;
  scheduledWork?: boolean;
  replyChannel?: "chat";
  sourceMessageCursor: number;
  meetingScheduleVersions?: Record<string, number>;
};
export type CareerBackgroundRun = {
  id: string; talent_id: string; conversation_id: string | null; status: string;
  trigger: string; trigger_payload: Record<string, any>; coverage?: Record<string, any>;
  created_at: string; completed_at?: string | null;
};
