import { queryKeyword } from "@/lib/llm/llm";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  if (req.method !== "POST")
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json();
  const { queryId, queryText } = body as {
    queryId?: string;
    queryText?: string;
  };

  if (!queryId || !queryText?.trim())
    return NextResponse.json(
      { error: "Missing queryId or queryText" },
      { status: 400 }
    );

  const keyword = await queryKeyword(queryText.trim());
  logger.log("keyword: ", keyword);

  const { error } = await supabase
    .from("queries")
    .update({ query_keyword: keyword })
    .eq("query_id", queryId);

  if (error)
    return NextResponse.json(
      { error: error?.message ?? "Failed" },
      { status: 500 }
    );

  return NextResponse.json({ ok: true }, { status: 200 });
}
