import { supabaseServer } from "@/lib/supabaseServer";
import type { Database } from "@/types/database.types";
import { logger } from "@/utils/logger";
import { NextRequest, NextResponse } from "next/server";
import { generateOneLineSummary, generateSummary } from "./utils";

const MAX_ONE_LINE_SUMMARY_SCHOLAR_PAPERS = 10;

type ScholarProfileSummary = Pick<
  Database["public"]["Tables"]["scholar_profile"]["Row"],
  "id" | "affiliation" | "topics" | "total_citations_num" | "h_index"
>;

type ScholarPaperSummary = Pick<
  Database["public"]["Tables"]["papers"]["Row"],
  | "id"
  | "title"
  | "published_at"
  | "pub_year"
  | "total_citations"
  | "external_link"
  | "scholar_link"
>;

async function attachScholarSummaryContext(doc: Record<string, any>) {
  const candidId = String(doc?.id ?? "").trim();
  if (!candidId) return doc;

  const { data: scholarProfile, error: scholarProfileError } =
    await supabaseServer
      .from("scholar_profile")
      .select("id, affiliation, topics, total_citations_num, h_index")
      .eq("candid_id", candidId)
      .maybeSingle();

  if (scholarProfileError) throw scholarProfileError;

  if (!scholarProfile?.id) {
    return {
      ...doc,
      scholar_profile: doc?.scholar_profile ?? null,
      scholar_papers: Array.isArray(doc?.scholar_papers)
        ? doc.scholar_papers.slice(0, MAX_ONE_LINE_SUMMARY_SCHOLAR_PAPERS)
        : [],
    };
  }

  const { data: contributions, error: contributionsError } =
    await supabaseServer
      .from("scholar_contributions")
      .select("paper_id")
      .eq("scholar_profile_id", scholarProfile.id);

  if (contributionsError) throw contributionsError;

  const paperIds = Array.from(
    new Set(
      (contributions ?? [])
        .map((row) =>
          String((row as { paper_id?: string | null }).paper_id ?? "").trim()
        )
        .filter(Boolean)
    )
  );

  let scholarPapers: ScholarPaperSummary[] = [];

  if (paperIds.length > 0) {
    const { data: papers, error: papersError } = await supabaseServer
      .from("papers")
      .select(
        "id, title, published_at, pub_year, total_citations, external_link, scholar_link"
      )
      .in("id", paperIds)
      .order("total_citations", { ascending: false })
      .order("pub_year", { ascending: false, nullsFirst: false })
      .limit(MAX_ONE_LINE_SUMMARY_SCHOLAR_PAPERS);

    if (papersError) throw papersError;
    scholarPapers = (papers as ScholarPaperSummary[] | null) ?? [];
  }

  return {
    ...doc,
    scholar_profile: scholarProfile as ScholarProfileSummary,
    scholar_papers: scholarPapers,
  };
}

export async function POST(req: NextRequest) {
  if (req.method !== "POST")
    return NextResponse.json({ error: "Method not allowed" }, { status: 405 });

  const body = await req.json();

  if (body.is_one_line) {
    const { doc } = body as {
      doc: any;
      is_one_line: boolean;
    };
    if (!doc?.id) {
      return NextResponse.json(
        { error: "Missing candidate id" },
        { status: 400 }
      );
    }

    const summaryDoc = await attachScholarSummaryContext(doc);
    const summary = await generateOneLineSummary(summaryDoc);

    const { error: insErr } = await supabaseServer.from("summary").insert({
      candid_id: doc.id,
      text: summary as string,
    });

    if (insErr) {
      logger.log("one_line_summary insert error:", insErr);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json(
      { result: summary, success: true },
      { status: 200 }
    );
  }

  const { doc, queryId, criteria, raw_input_text } = body as {
    doc: any;
    queryId: string;
    criteria: string[];
    raw_input_text: string;
  };

  if (!doc || !criteria || !raw_input_text)
    return NextResponse.json(
      { error: "Missing userId or queryText" },
      { status: 400 }
    );

  const summary = await generateSummary(doc, criteria, raw_input_text);
  // logger.log("summary ", summary);

  try {
    const jsonoutput = JSON.parse(summary as string);
  } catch (e) {
    return NextResponse.json({ error: "Invalid JSON format" }, { status: 400 });
  }

  const { error: insErr } = await supabaseServer
    .from("synthesized_summary")
    .insert({
      candid_id: doc.id,
      query_id: queryId,
      text: summary as string,
    });

  if (insErr)
    return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ result: summary, success: true }, { status: 200 });
}
