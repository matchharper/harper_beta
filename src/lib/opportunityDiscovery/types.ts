import type { Json } from "@/types/database.types";

export type OpportunityRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "partial";

export type OpportunityDiscoveryTrigger =
  | "conversation_completed"
  | "immediate_opportunity_requested"
  | "all_batch_feedback_submitted"
  | "periodic_refresh_due";

export type OpportunityRunMode = "initial" | "immediate" | "refine" | "refresh";

export type OpportunityDiscoveryAgentVariant =
  | "tool_agent"
  | "scripted"
  | "scripted_human";

export type OpportunityIngestionTrigger =
  | "scheduled_refresh"
  | "manual_admin_refresh"
  | "scope_expanded";

export type OpportunityRunRow = {
  completed_at: string | null;
  conversation_id: string | null;
  coverage: Json;
  created_at: string;
  error_message: string | null;
  id: string;
  query_plan: Json;
  run_mode: OpportunityRunMode;
  settings_snapshot: Json;
  started_at: string | null;
  status: OpportunityRunStatus;
  talent_id: string | null;
  trigger: OpportunityDiscoveryTrigger;
  trigger_payload: Json;
  user_brief: Json;
};

export type OpportunityIngestionRunRow = {
  completed_at: string | null;
  created_at: string;
  coverage: Json;
  error_message: string | null;
  id: string;
  source_scope: Json;
  started_at: string | null;
  status: OpportunityRunStatus;
  trigger: OpportunityIngestionTrigger;
};

export type RecommendationSettings = {
  periodicEnabled: boolean;
  periodicIntervalDays: number;
  recommendationBatchSize: number;
};
