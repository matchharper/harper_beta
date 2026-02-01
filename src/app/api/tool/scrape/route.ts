import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
// @ts-ignore: pdf-parse-fork 타입이 불완전할 수 있어 ignore
import pdf from "pdf-parse-fork";

import { htmlToReadableMarkdown } from "../utils";
import { supabase } from "@/lib/supabase";
import { logger } from "@/utils/logger";

// (선택) 혹시 런타임이 Edge로 잡히는 환경이면 강제로 Node로
export const runtime = "nodejs";

function isPdfUrl(url: string) {
    try {
        const u = new URL(url);
        return u.pathname.toLowerCase().endsWith(".pdf");
    } catch {
        // URL 파싱 실패 시 fallback
        return url.toLowerCase().split("?")[0].endsWith(".pdf");
    }
}

function normalizeText(s: string) {
    return s
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();

        if (!url || typeof url !== "string") {
            return NextResponse.json(
                { error: "Invalid or missing url" },
                { status: 400 }
            );
        }

        // 0) cache
        const cache = await supabase
            .from("documents")
            .select("*")
            .eq("url", url)
            .maybeSingle();

        if (cache.data) {
            logger.log("Cache hit for URL:", url);
            return NextResponse.json(
                {
                    id: cache.data.id,
                    url: cache.data.url,
                    title: cache.data.title,
                    markdown: cache.data.markdown,
                    excerpt: cache.data.excerpt,
                },
                { status: 200 }
            );
        }

        // 1) PDF 분기 (링크가 .pdf로 끝나면)
        if (isPdfUrl(url)) {
            logger.log("PDF detected:", url);

            // PDF 다운로드 → Buffer
            const resp = await axios.get(url, {
                responseType: "arraybuffer",
                // (선택) 일부 서버가 UA 없으면 차단하는 경우가 있어 추가
                headers: { "User-Agent": "Mozilla/5.0" },
                // (선택) 너무 큰 파일 방지
                maxContentLength: 25 * 1024 * 1024,
                maxBodyLength: 25 * 1024 * 1024,
                timeout: 20_000,
            });

            const buffer = Buffer.from(resp.data);

            // 첫 페이지만 파싱
            const data = await pdf(buffer, { max: 1 });

            const title = (data?.info?.Title || "PDF Document").toString().trim();
            const text = normalizeText((data?.text || "").toString());

            if (!text) {
                return NextResponse.json(
                    { error: "PDF has no extractable text (possibly scanned)" },
                    { status: 422 }
                );
            }

            const markdown = `# ${title}\n\n${text}`;
            const excerpt = text.slice(0, 600);

            const { data: ins, error: insErr } = await supabase
                .from("documents")
                .insert({
                    url,
                    title,
                    markdown,
                    excerpt,
                })
                .select("id")
                .single();

            if (insErr || !ins) {
                return NextResponse.json(
                    { error: insErr?.message ?? "Failed to insert document" },
                    { status: 500 }
                );
            }

            return NextResponse.json(
                {
                    id: ins.id,
                    url,
                    title,
                    markdown,
                    excerpt,
                },
                { status: 200 }
            );
        }

        // 2) HTML (기존 ScrapingDog)
        const apiKey = process.env.SCRAPINGDOG_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: "Missing SCRAPINGDOG_API_KEY" },
                { status: 500 }
            );
        }

        const params = {
            api_key: apiKey,
            url,
            dynamic: "false",
        };

        const resp = await axios.get("https://api.scrapingdog.com/scrape", {
            params,
            timeout: 20_000,
        });

        const result = htmlToReadableMarkdown(resp.data, url, { maxLinks: 60 });

        const { data: ins, error: insErr } = await supabase
            .from("documents")
            .insert({
                url: result.url,
                title: result.title,
                markdown: result.markdown,
                excerpt: result.excerpt,
            })
            .select("id")
            .single();

        if (insErr || !ins) {
            return NextResponse.json(
                { error: insErr?.message ?? "Failed to insert document" },
                { status: 500 }
            );
        }

        return NextResponse.json(
            {
                id: ins.id,
                url: result.url,
                title: result.title,
                markdown: result.markdown,
                excerpt: result.excerpt,
            },
            { status: 200 }
        );
    } catch (err: any) {
        console.error("Scrape error:", err);
        const status = err?.response?.status ?? 500;
        const message = err?.response?.data ?? err?.message ?? "Unknown error";
        return NextResponse.json({ error: message }, { status });
    }
}
