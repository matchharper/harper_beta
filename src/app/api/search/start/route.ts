import { supabase } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/utils/logger";

type RunPageCandidate = { id?: string; score?: number | string | null };

function filterPositiveScoreCandidates(items: RunPageCandidate[]) {
  return items.filter((item) => {
    const score = Number(item?.score);
    if (Number.isNaN(score)) return true;
    return score > 0;
  });
}

async function loadCandidateIds(runId: string, pageIdx: number) {
  const { data, error } = await supabase
    .from("runs_pages")
    .select("candidate_ids, created_at")
    .eq("run_id", runId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;

  const row = data?.[0];
  const all = filterPositiveScoreCandidates(
    (row?.candidate_ids ?? []) as RunPageCandidate[]
  );

  const start = pageIdx * 10;
  const end = start + 10;
  const ids = all.slice(start, end).map((r) => r.id).filter(Boolean) as string[];

  return { ids, total: all.length };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { runId, pageIdx } = body as {
    runId?: string;
    pageIdx?: number;
  };

  logger.log("/api/search/start read-only", body);

  if (!runId) {
    return NextResponse.json(
      { error: "Missing runId" },
      { status: 400 }
    );
  }

  const page = Number.isFinite(pageIdx) ? (pageIdx as number) : 0;
  const nextPageIdx = page + 1;

  try {
    const { ids } = await loadCandidateIds(runId, page);
    return NextResponse.json(
      { nextPageIdx, results: ids },
      { status: 200 }
    );
  } catch (e: any) {
    logger.log("search start read-only error", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
