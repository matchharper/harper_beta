import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { htmlToReadableMarkdown } from "../utils";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();

        if (!url || typeof url !== "string") {
            return NextResponse.json({ error: "Invalid or missing url" }, { status: 400 });
        }

        const cache = await supabase.from("documents").select("*").eq("url", url).maybeSingle();
        if (cache.data) {
            logger.log("Cache hit for URL:", url);

            return NextResponse.json({
                id: cache.data.id,
                url: cache.data.url,
                title: cache.data.title,
                markdown: cache.data.markdown,
                excerpt: cache.data.excerpt,
            }, { status: 200 });
        }

        const apiKey = process.env.SCRAPINGDOG_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Missing SCRAPINGDOG_API_KEY" }, { status: 500 });
        }

        const params = {
            api_key: apiKey,
            url,
            dynamic: "false",
        };

        const resp = await axios.get("https://api.scrapingdog.com/scrape", { params });

        const result = htmlToReadableMarkdown(resp.data, url, { maxLinks: 60 });

        const { data, error: insErr } = await supabase.from("documents").insert({
            url: result.url,
            title: result.title,
            markdown: result.markdown,
            excerpt: result.excerpt,
        })
            .select("id")
            .single();
        if (insErr || !data) {
            return NextResponse.json({ error: insErr?.message ?? "Failed to insert document" }, { status: 500 });
        }

        return NextResponse.json({
            id: data.id,
            url: result.url,
            title: result.title,
            markdown: result.markdown,
            excerpt: result.excerpt,
        }, { status: 200 });
    } catch (err: any) {
        console.error("ScrapingDog crawl error:", err);

        const status = err?.response?.status ?? 500;
        const message =
            err?.response?.data ?? err?.message ?? "Unknown error";

        return NextResponse.json({ error: message }, { status });
    }
}
