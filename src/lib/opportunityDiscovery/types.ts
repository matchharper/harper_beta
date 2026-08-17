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
  | "new_rule"
  | "new_v2"
  | "new_harper_agent_v2"
  | "scripted"
  | "scripted_human";

export const DEFAULT_OPPORTUNITY_DISCOVERY_AGENT_VARIANT: OpportunityDiscoveryAgentVariant =
  "new_harper_agent_v2";

export type OpportunityRunRow = {
  completed_at: string | null;
  conversation_id: string | null;
  coverage: Json;
  created_at: string;
  dedupe_key: string | null;
  error_message: string | null;
  id: string;
  last_progress_at?: string | null;
  lease_heartbeat_at?: string | null;
  lease_token?: string | null;
  query_plan: Json;
  run_mode: OpportunityRunMode;
  settings_snapshot: Json;
  started_at: string | null;
  status: OpportunityRunStatus;
  talent_id: string | null;
  target_recommendation_count: number;
  trigger: OpportunityDiscoveryTrigger;
  trigger_payload: Json;
  updated_at: string;
};

export type OpportunityRunSourceKind =
  | "initial"
  | "on_demand"
  | "feedback"
  | "periodic"
  | "other";

export type SerializedOpportunityRun = {
  active: boolean;
  agentVariant: OpportunityDiscoveryAgentVariant | null;
  candidateCount: number | null;
  completedAt: string | null;
  completionKind: string | null;
  coverage: Record<string, unknown>;
  createdAt: string;
  deliveryRetryPending: boolean;
  failureKind: string | null;
  id: string;
  inputLocked: boolean;
  purposeText: string | null;
  recommendationCount: number | null;
  requestedMaxResults: number | null;
  searchTerminal: boolean;
  sourceKind: OpportunityRunSourceKind;
  startedAt: string | null;
  status: OpportunityRunStatus;
  trigger: OpportunityDiscoveryTrigger;
  updatedAt?: string;
};

export type RecommendationSettings = {
  getExternalRecommendation: boolean;
  profileVisibility: string;
  recommendationBatchSize: number;
};
