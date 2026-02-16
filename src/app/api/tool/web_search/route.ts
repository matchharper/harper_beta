import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client"; // ✅ server-only
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = process.env.APIFY_CLIENT_KEY;
  const { query } = body ?? {};

  const cache = await supabase
    .from("documents")
    .select("*")
    .eq("url", query)
    .maybeSingle();
  if (cache.data) {
    return NextResponse.json(JSON.parse(cache.data.markdown ?? "[]"), {
      status: 200,
    });
  }

  // Initialize the ApifyClient with API token
  const client = new ApifyClient({
    token: token,
  });

  const input = {
    keyword: query,
    language: "ko",
    country: "KR",
    page: 1,
    limit: "10",
  };

  // Run the Actor and wait for it to finish
  const run = await client.actor("563JCPLOqM1kMmbbP").call(input);

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  console.log(items);
  console.log("\n\n----------\n\n");
  if (items.length <= 0 || !items) {
    return NextResponse.json({ response: [] }, { status: 200 });
  }

  const response = (items as any[])[items.length - 1].results.map((i: any) => {
    return {
      url: i.url,
      content: i.description,
      title: i.title,
    };
  });

  const { data, error: insErr } = await supabase
    .from("documents")
    .insert({
      url: query,
      title: "",
      markdown: JSON.stringify(response),
      excerpt: "",
    })
    .select("id")
    .single();

  return NextResponse.json(response, { status: 200 });
}
