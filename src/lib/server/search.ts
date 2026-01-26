import { supabase } from "@/lib/supabase";

type SearchArgs = {
  queryText: string;
  pageIdx: number;
  limit: number;
};

type SearchResult = {
  candidateIds: string[];
};

export async function runCandidateSearch({
  queryText,
  pageIdx,
  limit,
}: SearchArgs): Promise<SearchResult> {
  const q = queryText.trim();

  // 여기서 뭔가 LLM을 태워서 검색이 잘 되도록 하고싶긴함.

  const { data, error } = await supabase
    .from("candid")
    .select("id")
    .or([`headline.ilike.%${q}%`].join(","))
    .range(pageIdx * limit, (pageIdx + 1) * limit - 1);

  if (error) {
    throw new Error(error.message);
  }

  const ids = (data ?? []).map((r) => r.id);

  return { candidateIds: ids };
}
