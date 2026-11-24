/**
 * 추천이 많이 된 회사의 국민연금 가입 현황을 미리 찾아 company_datas에 캐시한다.
 *
 * harper_beta에서 단계별로 실행한다. 중간 결과는 output/nps/에 남고, 각 단계는 이어서 다시 돌릴 수 있다.
 *
 *   node --env-file=.env.local --import tsx scripts/nps/sync.ts select [--limit 1600]
 *   node --env-file=.env.local --import tsx scripts/nps/sync.ts pending [--size 100]
 *   node --env-file=.env.local --import tsx scripts/nps/sync.ts lookup <이름> [<이름> ...]
 *   node --env-file=.env.local --import tsx scripts/nps/sync.ts import <판단 파일> [...]
 *   node --env-file=.env.local --import tsx scripts/nps/sync.ts fetch [--limit 100]
 *   node --env-file=.env.local --import tsx scripts/nps/sync.ts write [--limit 10] [--dry-run]
 *   node --env-file=.env.local --import tsx scripts/nps/sync.ts refresh [--older-than-days 25] [--limit 100]
 *
 * select: 추천받은 사람 수가 많은 공개 회사(company_workspace, is_internal 제외)를 고른다.
 * pending: 아직 매칭하지 않은 회사를 판단할 묶음 파일로 나눈다.
 * lookup:  이름마다 국민연금 사업장 검색 결과를 짧게 보여 준다. 사람(또는 이 세션의 Claude)이 이걸 보고 사업장을 고른다.
 * import:  판단 파일([{id, searched, status, workplaces, reason}])을 matches.json에 합친다.
 * fetch:  고른 사업장의 최근 12개월 상세와 월별 입사·퇴사를 읽는다.
 * write:  원본 응답을 공개 출처로 남기고 company_datas에 label "국민연금 가입 현황"으로 저장한다.
 * refresh: 저장된 행의 사업장 정보로 다시 읽어 바뀐 달을 반영한다.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  NPS_WORKPLACE_API_BASE,
  NPS_WORKPLACE_OPERATIONS,
  NpsApiError,
  readNpsWorkplaceDetail,
  readNpsWorkplaceMonth,
  searchNpsWorkplaces,
  type NpsItem,
} from "./client";

export const NPS_LABEL = "국민연금 가입 현황";
const OUT = path.resolve("output/nps");
const NPS_CONCURRENCY = 6;

// ---------- small helpers ----------

const readJson = async <T>(file: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await readFile(path.join(OUT, file), "utf8")) as T; } catch { return fallback; }
};
const writeJson = async (file: string, value: unknown) => {
  await mkdir(path.dirname(path.join(OUT, file)), { recursive: true });
  await writeFile(path.join(OUT, file), JSON.stringify(value, null, 1));
};
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
/** 회사마다 하나로 고정된 company_datas id. */
const datumId = (workspaceId: string) => {
  const hex = sha(`nps-workplace:${workspaceId}`).slice(0, 32).split("");
  hex[12] = "5"; hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

async function pool<T, R>(items: T[], limit: number, run: (item: T, index: number) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await run(items[i], i); }
  }));
  return results;
}

/** 하루 호출 한도(사유 코드 22)에 걸리면 더 부르지 않고 지금까지 한 것을 저장한다. */
class QuotaExceeded extends Error {}
const isDailyQuota = (error: unknown) =>
  error instanceof NpsApiError && (error.details.code === "22" || /REQUESTS_EXCEEDS_ERROR/.test(error.message));
/** 초당 요청 제한(코드 23)과 시간 초과는 기다렸다가 다시 부른다. */
const NPS_OPTIONS = { timeoutMs: 30_000 };
const NPS_MIN_GAP_MS = Number(process.env.NPS_MIN_GAP_MS || 150);
let nextSlot = 0;
async function nps<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const now = Date.now(), start = Math.max(now, nextSlot);
    nextSlot = start + NPS_MIN_GAP_MS;
    if (start > now) await new Promise(resolve => setTimeout(resolve, start - now));
    try { return await call(); } catch (error) {
      if (isDailyQuota(error)) throw new QuotaExceeded(String(error instanceof Error ? error.message : error));
      if (attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 2_000 * (attempt + 1)));
    }
  }
}

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function pageAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

// ---------- select ----------

type Candidate = {
  workspaceId: string; rank: number; talents: number; recommendations: number;
  name: string; publishedName: string | null; homepage: string | null; linkedin: string | null; summary: string | null;
};

async function select(limit: number) {
  const db = admin();
  console.log("Reading recommendations…");
  const recs = await pageAll<{ talent_id: string; role_id: string | null; company_workspace_id: string | null }>(
    (from, to) => db.from("talent_opportunity_recommendation").select("talent_id,role_id,company_workspace_id").order("id").range(from, to));
  const roleIds = [...new Set(recs.filter(r => !r.company_workspace_id && r.role_id).map(r => r.role_id!))];
  const roleWorkspace = new Map<string, string>();
  for (let i = 0; i < roleIds.length; i += 300) {
    const { data, error } = await db.from("company_roles").select("role_id,company_workspace_id").in("role_id", roleIds.slice(i, i + 300));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) if (row.company_workspace_id) roleWorkspace.set(row.role_id, row.company_workspace_id);
  }
  const stats = new Map<string, { talents: Set<string>; recommendations: number }>();
  for (const rec of recs) {
    const ws = rec.company_workspace_id ?? (rec.role_id ? roleWorkspace.get(rec.role_id) : undefined);
    if (!ws) continue;
    const s = stats.get(ws) ?? { talents: new Set(), recommendations: 0 };
    s.talents.add(rec.talent_id); s.recommendations++; stats.set(ws, s);
  }
  const ranked = [...stats].sort((a, b) => b[1].talents.size - a[1].talents.size || b[1].recommendations - a[1].recommendations);
  const candidates: Candidate[] = [];
  for (let i = 0; i < ranked.length && candidates.length < limit; i += 200) {
    const ids = ranked.slice(i, i + 200).map(([id]) => id);
    const [workspaces, summaries] = await Promise.all([
      db.from("company_workspace").select("company_workspace_id,company_name,published_name,homepage_url,linkedin_url,is_internal").in("company_workspace_id", ids),
      db.from("company_datas").select("company_workspace_id,content").eq("label", "summary").in("company_workspace_id", ids),
    ]);
    if (workspaces.error) throw new Error(workspaces.error.message);
    if (summaries.error) throw new Error(summaries.error.message);
    const byId = new Map((workspaces.data ?? []).map(w => [w.company_workspace_id, w]));
    const summaryById = new Map((summaries.data ?? []).map(d => [d.company_workspace_id, d.content as string]));
    for (const [id, s] of ranked.slice(i, i + 200)) {
      const w = byId.get(id);
      // 고객(내부) workspace는 회사 자료가 생기면 이름으로 찾을 수 있게 되므로 건드리지 않는다.
      if (!w || w.is_internal || candidates.length >= limit) continue;
      candidates.push({
        workspaceId: id, rank: candidates.length + 1, talents: s.talents.size, recommendations: s.recommendations,
        name: w.company_name, publishedName: w.published_name, homepage: w.homepage_url, linkedin: w.linkedin_url,
        summary: summaryById.get(id)?.replace(/\[(\d+)\]\([^)]*\)/g, "").slice(0, 700) ?? null,
      });
    }
  }
  await writeJson("candidates.json", candidates);
  console.log(`Selected ${candidates.length} companies from ${stats.size} recommended companies.`);
}

// ---------- match ----------

type Workplace = { wkplNm: string; bzowrRgstNo: string; address: string; months: { month: string; seq: string }[]; status: string; type: string };
type Match = {
  workspaceId: string; name: string; searched: string[];
  status: "matched" | "none" | "not_korean" | "error";
  workplaces: Omit<Workplace, "months">[]; reason?: string; error?: string;
};

/** 같은 사업장이 달마다 한 줄씩 나오므로 이름·사업자번호 앞자리·주소로 묶는다. */
function groupWorkplaces(items: NpsItem[]): Workplace[] {
  const groups = new Map<string, Workplace>();
  for (const item of items) {
    const key = [item.wkplNm, item.bzowrRgstNo, item.wkplRoadNmDtlAddr].join("|");
    const group = groups.get(key) ?? { wkplNm: String(item.wkplNm ?? ""), bzowrRgstNo: String(item.bzowrRgstNo ?? ""),
      address: String(item.wkplRoadNmDtlAddr ?? ""), months: [], status: "", type: "" };
    group.months.push({ month: String(item.dataCrtYm), seq: String(item.seq) });
    const latest = group.months.reduce((a, b) => (a.month > b.month ? a : b));
    if (latest.month === String(item.dataCrtYm)) { group.status = String(item.wkplJnngStcd ?? ""); group.type = String(item.wkplStylDvcd ?? ""); }
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** 이름 하나의 검색 결과(모든 달). 디스크에 캐시한다. 너무 넓은 이름은 앞 500줄만 본다. */
async function searchName(name: string, bizRegPrefix?: string) {
  const file = `search/${sha(`${name}|${bizRegPrefix ?? ""}|${process.env.NPS_SEARCH_CACHE_BUST ?? ""}`).slice(0, 24)}.json`;
  const cached = await readJson<{ name: string; items: NpsItem[]; total: number | null } | null>(file, null);
  if (cached) return cached;
  const items: NpsItem[] = [];
  let total: number | null = null;
  for (let pageNo = 1; pageNo <= 5; pageNo++) {
    const page = await nps(() => searchNpsWorkplaces({ name, bizRegPrefix, pageNo, numOfRows: 100 }, NPS_OPTIONS));
    total = page.totalCount;
    items.push(...page.items);
    if (!page.items.length || total == null || items.length >= total) break;
  }
  const result = { name, items, total };
  await writeJson(file, result);
  return result;
}

/** 아직 판단하지 않은 회사(오류 포함)를 n개씩 나눠 output/nps/todo/에 쓴다. 판단은 사람이나 이 세션의 Claude가 한다. */
async function pending(size: number) {
  const candidates = await readJson<Candidate[]>("candidates.json", []);
  const matches = await readJson<Record<string, Match>>("matches.json", {});
  const todo = candidates.filter(c => !matches[c.workspaceId] || matches[c.workspaceId].status === "error");
  for (let i = 0; i < todo.length; i += size) await writeJson(`todo/batch-${String(i / size + 1).padStart(2, "0")}.json`, todo.slice(i, i + size));
  console.log(`${todo.length} companies in ${Math.ceil(todo.length / size)} files under output/nps/todo/.`);
}

/** 이름마다 국민연금 검색 결과를 사업장 단위로 묶어 짧게 출력한다. 검색 결과는 캐시한다. */
async function lookup(names: string[]) {
  for (const raw of names) {
    // "이름#123456"이면 사업자등록번호 앞 6자리로 좁혀 찾는다.
    const [name, prefix] = raw.split("#");
    const result = await searchName(name, prefix?.replace(/\D/g, "").slice(0, 6) || undefined);
    const groups = groupWorkplaces(result.items);
    const truncated = result.total != null && result.items.length < result.total;
    console.log(`\n## ${raw} — 사업장 ${groups.length}곳${truncated ? ` (전체 ${result.total}줄 중 앞 ${result.items.length}줄만 봄)` : ""}`);
    for (const g of groups.slice(0, 60)) {
      const months = g.months.map(m => m.month).sort();
      console.log(`- ${g.wkplNm} | ${g.bzowrRgstNo} | ${g.address} | ${g.type === "1" ? "법인" : g.type === "2" ? "개인" : g.type} | ${g.status === "2" ? "탈퇴" : "등록"} | ${months[0]}~${months.at(-1)}`);
    }
    if (groups.length > 60) console.log(`- … ${groups.length - 60}곳 더 있음. 더 구체적인 이름으로 다시 찾을 것.`);
  }
}

type Decision = { id: string; searched?: string[]; status: "matched" | "none" | "not_korean";
  workplaces?: { wkplNm: string; bzowrRgstNo: string; address: string }[]; reason?: string };

/** 판단 파일을 matches.json에 합친다. 고른 사업장은 검색 캐시에 실제로 있는지 확인하고 상태·형태를 채운다. */
async function importDecisions(files: string[]) {
  const candidates = new Map((await readJson<Candidate[]>("candidates.json", [])).map(c => [c.workspaceId, c]));
  const matches = await readJson<Record<string, Match>>("matches.json", {});
  const problems: string[] = [];
  let imported = 0;
  // 판단할 때 본 검색 결과(캐시)에서 먼저 확인한다. 없을 때만 API로 다시 찾는다.
  const { readdir } = await import("node:fs/promises");
  const cached = new Map<string, Workplace>();
  for (const file of await readdir(path.join(OUT, "search")).catch(() => [] as string[])) {
    const result = await readJson<{ items: NpsItem[] } | null>(`search/${file}`, null);
    for (const g of groupWorkplaces(result?.items ?? [])) cached.set([g.wkplNm, g.bzowrRgstNo, g.address].join("|"), g);
  }
  for (const file of files) {
    const decisions = JSON.parse(await readFile(path.resolve(file), "utf8")) as Decision[];
    for (const d of decisions) {
      const candidate = candidates.get(d.id);
      if (!candidate) { problems.push(`${file}: unknown id ${d.id}`); continue; }
      const chosen: Match["workplaces"] = [];
      for (const w of d.status === "matched" ? d.workplaces ?? [] : []) {
        const prefix = w.bzowrRgstNo.replace(/\D/g, "").slice(0, 6) || undefined;
        const found = cached.get([w.wkplNm, w.bzowrRgstNo, w.address].join("|")) ?? groupWorkplaces((await searchName(w.wkplNm, prefix)).items)
          .find(g => g.wkplNm === w.wkplNm && g.bzowrRgstNo === w.bzowrRgstNo && g.address === w.address);
        if (found) chosen.push({ wkplNm: found.wkplNm, bzowrRgstNo: found.bzowrRgstNo, address: found.address, status: found.status, type: found.type });
        else problems.push(`${candidate.name}: workplace not found ${w.wkplNm} | ${w.bzowrRgstNo} | ${w.address}`);
      }
      if (d.status === "matched" && !chosen.length) continue;
      matches[d.id] = { workspaceId: d.id, name: candidate.name, searched: d.searched ?? [], status: d.status, workplaces: chosen, reason: d.reason };
      imported++;
    }
  }
  await writeJson("matches.json", matches);
  const counts = Object.values(matches).reduce<Record<string, number>>((acc, m) => ({ ...acc, [m.status]: (acc[m.status] ?? 0) + 1 }), {});
  console.log(`Imported ${imported}.`, counts);
  for (const problem of problems) console.error(problem);
}

// ---------- fetch ----------

type MonthRow = { month: string; seq: string; detail: NpsItem | null; flow: NpsItem | null };
type History = { workspaceId: string; fetchedAt: string; workplaces: (Omit<Workplace, "months"> & { rows: MonthRow[] })[] };

async function fetchWorkplace(workplace: Omit<Workplace, "months">): Promise<MonthRow[]> {
  const prefix = workplace.bzowrRgstNo.replace(/\D/g, "").slice(0, 6) || undefined;
  const result = await searchName(workplace.wkplNm, prefix);
  const group = groupWorkplaces(result.items).find(g =>
    g.wkplNm === workplace.wkplNm && g.bzowrRgstNo === workplace.bzowrRgstNo && g.address === workplace.address);
  if (!group) return [];
  return pool(group.months.sort((a, b) => a.month.localeCompare(b.month)), 3, async ({ month, seq }) => {
    const [detail, flow] = await Promise.all([
      nps(() => readNpsWorkplaceDetail(seq, NPS_OPTIONS)).then(p => p.items[0] ?? null),
      nps(() => readNpsWorkplaceMonth(seq, month, NPS_OPTIONS)).then(p => p.items[0] ?? null),
    ]);
    return { month, seq, detail, flow };
  });
}

async function fetchHistories(limit: number, workspaces?: { workspaceId: string; workplaces: Omit<Workplace, "months">[] }[], force = false) {
  const matches = await readJson<Record<string, Match>>("matches.json", {});
  const targets = workspaces ?? Object.values(matches).filter(m => m.status === "matched");
  const todo: typeof targets = [];
  for (const t of targets) {
    if (todo.length >= limit) break;
    if (force || !(await readJson<History | null>(`history/${t.workspaceId}.json`, null))) todo.push(t);
  }
  console.log(`Fetching ${todo.length} companies.`);
  let done = 0;
  try {
    await pool(todo, 2, async t => {
      const workplaces = [];
      for (const workplace of t.workplaces) workplaces.push({ ...workplace, rows: await fetchWorkplace(workplace) });
      await writeJson(`history/${t.workspaceId}.json`, { workspaceId: t.workspaceId, fetchedAt: new Date().toISOString(), workplaces });
      if (++done % 10 === 0) console.log(`  ${done}/${todo.length}`);
    });
  } catch (error) {
    if (error instanceof QuotaExceeded) { console.error(`NPS daily quota reached after ${done} (${error.message}); run fetch again later.`); return false; }
    throw error;
  }
  console.log(`Fetched ${done}.`);
  return true;
}

// ---------- write ----------

const won = (value: unknown) => (value == null || value === "" ? "-" : Number(value).toLocaleString("ko-KR"));
const cell = (value: unknown) => (value == null || value === "" ? "-" : String(value));
const ymd = (value: unknown) => (/^\d{8}$/.test(String(value)) && String(value) !== "00010101"
  ? `${String(value).slice(0, 4)}-${String(value).slice(4, 6)}-${String(value).slice(6)}` : null);

/** company_datas에 저장할 글. 첫 줄의 '사업장:' 줄은 refresh가 다시 찾을 때 읽는다. */
const NO_ADDRESS = "주소 없음";
const monthLabel = (month: string) => `${month.slice(0, 4)}-${month.slice(4)}`;
const TABLE_HEAD = ["| 월 | 가입자수 | 입사(신규취득) | 퇴사(상실) | 당월고지금액(원) |", "| --- | ---: | ---: | ---: | ---: |"];
const num = (value: unknown) => (value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value));

/** 사업장 한 줄. refresh는 이 줄의 이름·사업자등록번호·주소로 같은 사업장을 다시 찾는다. */
function workplaceLine(w: History["workplaces"][number], withLatestCount: boolean) {
  const latestRow = [...w.rows].reverse().find(r => r.detail);
  const latest = latestRow?.detail ?? {};
  const facts = [
    `사업자등록번호 ${w.bzowrRgstNo}`, w.address || NO_ADDRESS,
    w.type === "1" ? "법인" : w.type === "2" ? "개인사업장" : null,
    ymd(latest.adptDt) ? `국민연금 적용 ${ymd(latest.adptDt)}` : null,
    w.status === "2" ? `탈퇴${ymd(latest.scsnDt) ? ` ${ymd(latest.scsnDt)}` : ""}` : null,
    latest.vldtVlKrnNm && latest.wkplIntpCd !== "999999" ? `업종 ${latest.vldtVlKrnNm}` : null,
    withLatestCount && latestRow && num(latest.jnngpCnt) != null ? `${monthLabel(latestRow.month)} 가입자 ${num(latest.jnngpCnt)}명` : null,
  ].filter(Boolean);
  return `사업장: ${w.wkplNm} · ${facts.join(" · ")}`;
}

/**
 * company_datas에 저장할 글. 사업장이 하나면 그 사업장의 달별 표를,
 * 여럿이면 달마다 모든 사업장을 더한 표 하나와 사업장별 한 줄을 쓴다.
 */
export function formatNpsContent(history: History) {
  const workplaces = history.workplaces.filter(w => w.rows.some(r => r.detail));
  if (!workplaces.length) return null;
  let body: string;
  if (workplaces.length === 1) {
    const w = workplaces[0];
    body = [workplaceLine(w, false), "", ...TABLE_HEAD,
      ...w.rows.map(r => `| ${monthLabel(r.month)} | ${cell(r.detail?.jnngpCnt)} | ${cell(r.flow?.nwAcqzrCnt)} | ${cell(r.flow?.lssJnngpCnt)} | ${won(r.detail?.crrmmNtcAmt)} |`)].join("\n");
  } else {
    const months = [...new Set(workplaces.flatMap(w => w.rows.map(r => r.month)))].sort();
    const sum = (month: string, pick: (r: MonthRow) => unknown) => {
      const values = workplaces.map(w => w.rows.find(r => r.month === month)).map(r => (r ? num(pick(r)) : null)).filter((v): v is number => v != null);
      return values.length ? values.reduce((a, b) => a + b, 0) : null;
    };
    const rows = months.map(m => `| ${monthLabel(m)} | ${cell(sum(m, r => r.detail?.jnngpCnt))} | ${cell(sum(m, r => r.flow?.nwAcqzrCnt))} | ${cell(sum(m, r => r.flow?.lssJnngpCnt))} | ${won(sum(m, r => r.detail?.crrmmNtcAmt))} |`);
    body = [`사업장 ${workplaces.length}곳의 합계`, "", ...TABLE_HEAD, ...rows, "", ...workplaces.map(w => workplaceLine(w, true))].join("\n");
  }
  return [body,
    "국민연금공단 공공데이터의 사업장별 월간 기록이다(전월 기준, 최근 12개월). 가입자수는 그 달 보험료가 고지된 인원이라 만 60세 이상과 일부 단시간·일용 근로자는 빠진다. " +
    "입사에는 납부재개, 퇴사에는 납부예외(휴직 등)가 함께 잡히고, 같은 회사 사업장 사이의 이동도 입사·퇴사로 잡힐 수 있다. " +
    "당월고지금액은 사업장 전체 월 보험료(기준소득월액 × 보험료율, 회사·직원 부담 합계)다. 보험료율은 2025년까지 9%, 2026년 9.5%이고, " +
    "기준소득월액 상한은 2025.7~2026.6 637만 원, 2026.7~2027.6 659만 원이다.",
  ].join("\n\n");
}

async function captureSource(db: SupabaseClient, history: History) {
  const first = history.workplaces[0];
  const url = new URL(`${NPS_WORKPLACE_API_BASE}/${NPS_WORKPLACE_OPERATIONS.search}`);
  url.searchParams.set("wkplNm", first.wkplNm);
  const prefix = first.bzowrRgstNo.replace(/\D/g, "").slice(0, 6);
  if (prefix) url.searchParams.set("bzowrRgstNo", prefix);
  // 출처 본문은 받은 응답 그대로다. 서비스키는 URL과 본문 어디에도 넣지 않는다.
  const content = JSON.stringify(history.workplaces.map(w => ({ wkplNm: w.wkplNm, bzowrRgstNo: w.bzowrRgstNo, address: w.address,
    rows: w.rows.map(r => ({ dataCrtYm: r.month, seq: r.seq, ...r.detail, ...r.flow })) })));
  const { data, error } = await db.rpc("career_capture_public_source_v1", {
    p_resource_key: `public:${url.toString()}`, p_url: url.toString(),
    p_title: `국민연금 가입 사업장 내역 — ${history.workplaces.map(w => w.wkplNm).join(", ")}`,
    p_content: content, p_hash: sha(content),
    p_provenance: { scope: "public", provider: "data_go_kr_nps", contract: "nps-workplace-history-v1",
      coverage: "국민연금공단_국민연금 가입 사업장 내역 Open API (data.go.kr 3046071), 최근 12개월", requestedAt: history.fetchedAt },
    p_published_at: null, p_fetched_at: history.fetchedAt, p_lease_owner: null,
  });
  if (error) throw new Error(error.message);
  return (data as { observationId: string }).observationId;
}

async function writeOne(db: SupabaseClient, history: History, dryRun: boolean) {
  const content = formatNpsContent(history);
  if (!content) return "empty";
  if (dryRun) { console.log(`\n--- ${history.workspaceId}\n${content}`); return "dry-run"; }
  const id = datumId(history.workspaceId);
  const current = await db.from("company_datas").select("id,revision,company_workspace_id").eq("id", id).maybeSingle();
  if (current.error) throw new Error(current.error.message);
  const observationId = await captureSource(db, history);
  const { data, error } = await db.rpc("career_write_company_datum_v1", {
    p_target: { kind: "company_workspace", id: history.workspaceId }, p_label: NPS_LABEL, p_content: content,
    p_source_refs: [{ kind: "observation", id: observationId }],
    p_data_ref: current.data ? { kind: "company_datum", id, revision: String(current.data.revision) } : null,
    p_request_id: id,
  });
  if (error) throw new Error(error.message);
  return (data as { status?: string }).status ?? "unknown";
}

async function write(limit: number, dryRun: boolean, only?: string[]) {
  const db = admin();
  const matches = await readJson<Record<string, Match>>("matches.json", {});
  const ids = only ?? Object.values(matches).filter(m => m.status === "matched").map(m => m.workspaceId);
  const written = await readJson<Record<string, string>>("written.json", {});
  const todo = ids.filter(id => only || !written[id]).slice(0, limit);
  const counts: Record<string, number> = {};
  for (const id of todo) {
    const history = await readJson<History | null>(`history/${id}.json`, null);
    if (!history) { counts.no_history = (counts.no_history ?? 0) + 1; continue; }
    try {
      const status = await writeOne(db, history, dryRun);
      counts[status] = (counts[status] ?? 0) + 1;
      if (!dryRun) written[id] = `${status} ${new Date().toISOString()}`;
    } catch (error) {
      counts.error = (counts.error ?? 0) + 1;
      console.error(id, error instanceof Error ? error.message : error);
    }
  }
  if (!dryRun) await writeJson("written.json", written);
  console.log("Write:", counts);
}

// ---------- refresh ----------

/** 저장된 글의 '사업장:' 줄에서 사업장 이름·사업자번호 앞자리·주소를 다시 읽는다. */
export function parseNpsWorkplaces(content: string) {
  return [...content.matchAll(/^사업장: (.+?) · 사업자등록번호 (\S+) · ([^·\n]+?)(?: · |$)/gm)]
    .map(m => ({ wkplNm: m[1], bzowrRgstNo: m[2], address: m[3].trim() === NO_ADDRESS ? "" : m[3].trim(), status: "", type: "" }));
}

async function refresh(olderThanDays: number, limit: number) {
  const db = admin();
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString();
  const rows = await pageAll<{ company_workspace_id: string; content: string; checked_at: string | null }>((from, to) =>
    db.from("company_datas").select("company_workspace_id,content,checked_at").eq("label", NPS_LABEL)
      .or(`checked_at.is.null,checked_at.lt.${cutoff}`).order("checked_at", { ascending: true, nullsFirst: true }).range(from, to));
  const targets = rows.slice(0, limit).map(row => ({ workspaceId: row.company_workspace_id, workplaces: parseNpsWorkplaces(row.content) }))
    .filter(t => t.workplaces.length);
  console.log(`Refreshing ${targets.length} of ${rows.length} entries checked before ${cutoff.slice(0, 10)}.`);
  // 지난 달 검색 캐시를 쓰지 않도록 이번 실행의 검색 결과는 새로 받는다.
  process.env.NPS_SEARCH_CACHE_BUST = new Date().toISOString().slice(0, 7);
  const complete = await fetchHistories(targets.length, targets, true);
  await write(targets.length, false, targets.map(t => t.workspaceId));
  if (!complete) console.error("Some companies were not refreshed because of the NPS quota.");
}

// ---------- main ----------

/** 홈페이지에 적힌 사업자등록번호(000-00-00000)를 모은다. 한국 회사는 보통 페이지 하단에 적는다. */
async function biznum() {
  const candidates = new Map((await readJson<Candidate[]>("candidates.json", [])).map(c => [c.workspaceId, c]));
  const matches = await readJson<Record<string, Match>>("matches.json", {});
  const targets = Object.values(matches).filter(m => m.status === "none").map(m => candidates.get(m.workspaceId)!).filter(c => c?.homepage);
  const found: Record<string, { pages: string[]; numbers: { number: string; context: string }[] }> = {};
  await pool(targets, 6, async c => {
    const homepage = /^https?:\/\//i.test(c.homepage!) ? c.homepage! : `https://${c.homepage}`;
    let home: URL;
    try { home = new URL(homepage); } catch { return; }
    const pages = [...new Set([homepage, `${home.origin}/`])];
    const numbers = new Map<string, string>();
    for (const page of pages) {
      try {
        const response = await fetch(page, { signal: AbortSignal.timeout(12_000), redirect: "follow",
          headers: { "user-agent": "Mozilla/5.0 (compatible; HarperBot/1.0)", "accept-language": "ko-KR,ko;q=0.9" } });
        const text = (await response.text()).replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ");
        for (const m of text.matchAll(/(\d{3})\s*-\s*(\d{2})\s*-\s*(\d{5})/g)) {
          const context = text.slice(Math.max(0, (m.index ?? 0) - 80), (m.index ?? 0) + 30);
          if (/사업자|business|등록번호|registration/i.test(context)) numbers.set(`${m[1]}-${m[2]}-${m[3]}`, context.trim());
        }
      } catch { /* 열리지 않는 페이지는 건너뛴다 */ }
    }
    found[c.workspaceId] = { pages, numbers: [...numbers].map(([number, context]) => ({ number, context })) };
  });
  await writeJson("biznum.json", found);
  console.log(`Checked ${targets.length} homepages; numbers found for ${Object.values(found).filter(f => f.numbers.length).length}.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const flag = (name: string, fallback: number) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };
  if (command === "select") return select(flag("limit", 1600));
  if (command === "pending") return pending(flag("size", 100));
  if (command === "lookup") return lookup(args.filter(a => !a.startsWith("--")));
  if (command === "import") return importDecisions(args);
  if (command === "biznum") return biznum();
  if (command === "fetch") return void (await fetchHistories(flag("limit", 100)));
  if (command === "write") return write(flag("limit", 10), args.includes("--dry-run"));
  if (command === "refresh") return refresh(flag("older-than-days", 25), flag("limit", 100));
  console.error("Usage: select | pending | lookup <name>... | import <file>... | fetch | write [--dry-run] | refresh");
  process.exitCode = 2;
}

if (process.argv[1]?.endsWith("sync.ts")) main().catch(error => { console.error(error); process.exitCode = 1; });
