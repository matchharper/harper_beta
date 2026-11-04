import type { CompanyIdentity } from "@/lib/career/companies/server";

export type CompanySearchDebugResponse = {
  input: { query: string; offset: number };
  durationMs: number;
  companies: CompanyIdentity[];
  nextOffset: number | null;
  coverage: string;
  modelOutput: string;
};
