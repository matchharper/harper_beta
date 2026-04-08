import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client"; // ✅ server-only
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      query?: string;
    };
    const query = String(body.query ?? "").trim();
    const token = String(process.env.APIFY_CLIENT_KEY ?? "").trim();

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json(
        { error: "APIFY_CLIENT_KEY is not configured" },
        { status: 503 }
      );
    }

    console.log(`\n\n-----웹 검색 ${query}-----\n\n`);

    const cache = await supabase
      .from("documents")
      .select("*")
      .eq("url", query)
      .maybeSingle();

    if (cache.data?.markdown) {
      try {
        return NextResponse.json(JSON.parse(cache.data.markdown), {
          status: 200,
        });
      } catch (error) {
        console.warn("[web_search] failed to parse cached payload", {
          error: error instanceof Error ? error.message : String(error),
          query,
        });
      }
    }

    const client = new ApifyClient({
      token,
    });

    const input = {
      keyword: query,
      language: "ko",
      country: "KR",
      page: 1,
      limit: "10",
      logger: null,
    };

    const run = await client.actor("563JCPLOqM1kMmbbP").call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    if (!items || items.length === 0) {
      return NextResponse.json({ response: [] }, { status: 200 });
    }
    const lastItem = items[items.length - 1] as {
      results?: Array<{
        description?: string;
        title?: string;
        url?: string;
      }>;
    };
    const response = Array.isArray(lastItem?.results)
      ? lastItem.results.map((item) => ({
          content: String(item.description ?? ""),
          title: String(item.title ?? ""),
          url: String(item.url ?? ""),
        }))
      : [];
    console.log("\n\n----------\n\n");

    // const { error: insertError } = await supabase.from("documents").insert({
    //   url: query,
    //   title: "",
    //   markdown: JSON.stringify(response),
    //   excerpt: "",
    // });

    // if (insertError) {
    //   console.warn("[web_search] failed to cache search response", {
    //     error: insertError.message,
    //     query,
    //   });
    // }

    return NextResponse.json(response, { status: 200 });
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
