// Builds or refreshes the company search index (career_company_search) for every
// public company_workspace, in pages. Safe to rerun: unchanged bodies are skipped.
// Usage: node --import tsx scripts/career/indexCompanySearch.ts
import { createClient } from "@supabase/supabase-js";
import { indexCompanies } from "@/lib/career/companies/discovery";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const admin = createClient(url, key, { auth: { persistSession: false } }) as never;
async function main() {
let after: string | null = null, pages = 0, indexed = 0;
for (;;) {
  const result: { indexed: number; last: string | null } = await indexCompanies(admin, { after: after ?? undefined, limit: 200 });
  if (!result.last) break;
  after = result.last; pages++; indexed += result.indexed;
  if (pages % 10 === 0) console.log(`pages ${pages}, embedded ${indexed}`);
}
console.log(`done: pages ${pages}, embedded ${indexed}`);
}
main().catch(error => { console.error(error); process.exit(1); });
