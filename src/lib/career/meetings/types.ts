export type TalentMeetingSchedule = {
  calendar?: { conference_url: string | null } | null;
  role?: {
    name: string;
    company_workspace: { company_name: string | null } | null;
  } | null;
  id: string;
  talent_id: string;
  role_id: string | null;
  scheduling_source: "harper" | "external";
  title: string;
  content: string;
  timezone: string;
  confirmed_start_at: string | null;
  confirmed_end_at: string | null;
  status: string;
  version: number;
  source_key: string | null;
  source_refs: {
    gmailThreadIds?: string[];
    gmailMessageIds?: string[];
    messageIds?: number[];
    [key: string]: unknown;
  };
};
