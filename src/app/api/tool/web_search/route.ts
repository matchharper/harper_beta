import { NextRequest, NextResponse } from "next/server";
import { ApifyClient } from "apify-client"; // ✅ server-only
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const token = process.env.APIFY_CLIENT_KEY;
    const { query } = body ?? {};

    const cache = await supabase.from("documents").select("*").eq("url", query).maybeSingle();
    if (cache.data) {
        return NextResponse.json(JSON.parse(cache.data.markdown ?? "[]"), { status: 200 });
    }

    // Initialize the ApifyClient with API token
    const client = new ApifyClient({
        token: token,
    });

    const input = {
        "query": query,
        "language": "ko",
        "country": "KR",
        "page": 1
    };

    // Run the Actor and wait for it to finish
    const run = await client.actor("4k7HSBE8TWyKZ9E6x").call(input);

    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    const response = items.map((i: any) => ({
        "url": i.url,
        "content": i.content,
        "title": i.title
    }))

    const { data, error: insErr } = await supabase.from("documents").insert({
        url: query,
        title: "",
        markdown: JSON.stringify(response),
        excerpt: "",
    })
        .select("id")
        .single();

    return NextResponse.json(response, { status: 200 });
}
