import { NextRequest, NextResponse } from "next/server";
import { runWebSearch } from "@/lib/tools/webSearch";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      maxResults?: number;
      query?: string;
    };
    const query = String(body.query ?? "").trim();

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    console.log(`\n\n-----웹 검색 ${query}-----\n\n`);
    const response = await runWebSearch({
      query,
      maxResults: body.maxResults,
    });
    console.log("\n\n----------\n\n");

    return NextResponse.json(
      response.results.map((item) => ({
        content: item.snippet,
        title: item.title,
        url: item.url,
      })),
      { status: 200 }
    );
  } catch (error) {
    console.error("[web_search] request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "web_search request failed",
      },
      { status: 500 }
    );
  }
}
