import { Database } from "./database.types";

export type CandidateType = Database["public"]["Tables"]["candid"]["Row"];
export type QueryType = Database["public"]["Tables"]["queries"]["Row"];
export type SynthesizedSummaryType =
  Database["public"]["Tables"]["synthesized_summary"]["Row"];
export type CompanyType = Database["public"]["Tables"]["company_db"]["Row"];
export type ExpUserType =
  Database["public"]["Tables"]["experience_user"]["Row"];
export type EduUserType = Database["public"]["Tables"]["edu_user"]["Row"];


export enum SummaryScore {
  SATISFIED = "만족",
  AMBIGUOUS = "모호",
  UNSATISFIED = "불만족",
}

export enum StatusEnum {
  STARTING = "starting",
  EXPANDING = "expanding",
  PARSING = "parsing",
  REFINE = "refine",
  DONE = "done",
  FINISHED = "finished",
  RERANKING = "reranking",
  RERANKING_STREAMING = "streaming",
  RUNNING = "running",
  ERROR = "error",
  QUEUED = "queued",
  STOPPED = "stopped"
}