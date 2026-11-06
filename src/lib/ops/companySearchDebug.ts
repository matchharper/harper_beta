import type { CompanyIdentity } from "@/lib/career/companies/server";

export type CompanySearchDebugResponse = {
  input: { queries: string[]; offset: number };
  durationMs: number;
  companies: CompanyIdentity[];
  nextOffset: number | null;
  coverage: string;
  modelOutput: string;
};
