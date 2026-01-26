import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CandidateType } from "@/types/type";
import { logger } from "@/utils/logger";

export type CandidateDetail = CandidateType & {
  connection?: { user_id: string; typed: number }[];
};

export const synthesizedSummaryKey = (queryId?: string, candidId?: string) =>
  ["synthesizedSummary", queryId ?? null, candidId ?? null] as const;

type SynthesizedSummaryRow = {
  text: string | null;
  candid_id: string;
  query_id: string;
};

async function fetchSynthesizedSummary(queryId: string, candidId: string) {
  logger.log("DB 조회 ", candidId);
  const { data, error } = await supabase
    .from("synthesized_summary")
    .select(`text, candid_id, query_id`)
    .eq("candid_id", candidId)
    .eq("query_id", queryId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as SynthesizedSummaryRow | null) ?? null;
}

export function useSynthesizedSummary(params?: {
  queryId?: string;
  candidId?: string;
  doc?: CandidateDetail;
  criteria?: string[];
  raw_input_text?: string | null;
  enabled?: boolean;
  text?: string | null;
}) {
  const {
    queryId,
    candidId,
    doc,
    criteria,
    raw_input_text,
    enabled = true,
    text,
  } = params ?? {};
  return useQuery({
    queryKey: synthesizedSummaryKey(queryId, candidId),
    enabled: !!queryId && !!candidId && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const qid = queryId!;
      const cid = candidId!;
      if (text && text.length > 0) {
        return text;
      }

      // 1) DB 조회
      const existing = await fetchSynthesizedSummary(qid, cid);
      logger.log("DB 조회 ", candidId, existing);
      if (existing?.text) return existing.text;

      // 2) 생성에 필요한 입력이 없으면 여기서 더 못 함 (그냥 null 리턴)
      if (!doc || !criteria || criteria.length === 0) return "";

      // // 3) API로 생성
      // const generated = await generateSynthesizedSummary({
      //   doc,
      //   queryId: qid,
      //   candidId: cid,
      //   criteria,
      //   raw_input_text,
      // });
      // logger.log("API로 요약 생성 ", candidId);

      // // 4) DB upsert (캐시/다른 곳 재사용 가능하게)
      // const saved = await upsertSynthesizedSummary(generated);

      return "";
    },
  });
}
