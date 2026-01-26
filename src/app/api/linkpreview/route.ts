// src/app/api/linkpreview/route.ts
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs"; // 안정성 ↑ (Edge에서도 가능하지만, 운영상 node가 편함)

// 캐시 TTL (예: 7일)
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---- utils ----
function isBlockedHost(hostname: string) {
  const h = hostname.toLowerCase();

  // localhost / local domains
  if (h === "localhost" || h.endsWith(".local")) return true;

  // 아주 단순한 사설망/루프백 IPv4 차단 (hostname이 IP인 경우)
  // 더 강력하게 하려면 DNS resolve 후 실제 IP 대역 검사까지 해야 함.
  if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h))
    return true;

  return false;
}

function decodeHtmlEntities(s: string) {
  // title에 흔히 나오는 최소 엔티티만 처리
  return s
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&nbsp;", " ");
}

function extractTitle(html: string) {
  // og:title 우선 (속성 순서 두 케이스 모두 대응)
  const og1 =
    html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i
    )?.[1] ?? null;

  const og2 =
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["'][^>]*>/i
    )?.[1] ?? null;

  const og = og1 ?? og2;

  if (og) return decodeHtmlEntities(og.trim()).slice(0, 300);

  // <title> fallback (개행 포함 가능)
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  if (t) return decodeHtmlEntities(t.replace(/\s+/g, " ").trim()).slice(0, 300);

  return null;
}

function extractPublishedDate(html: string): string | null {
  try {
    const candidates = [
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']pubdate["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']publish-date["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']date["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+property=["']og:updated_time["'][^>]+content=["']([^"']+)["']/i,
    ];

    for (const r of candidates) {
      const m = html.match(r);
      if (m?.[1]) return m[1].trim();
    }

    return null;
  } catch (e) {
    return null;
  }
}

function extractDescription(html: string): string | null {
  try {
    const og =
      html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i
      )?.[1] ??
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["'][^>]*>/i
      )?.[1];

    if (og) return decodeHtmlEntities(og.trim()).slice(0, 500);

    const meta = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    )?.[1];

    return meta ? decodeHtmlEntities(meta.trim()).slice(0, 500) : null;
  } catch (e) {
    return null;
  }
}

async function fetchHtml(url: string) {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 6000);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "LinkPreviewBot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) throw new Error("NOT_HTML");

    const text = await res.text();

    // 너무 큰 페이지 방어 (필요하면 더 낮추거나 stream으로 개선)
    if (text.length > 1_000_000) throw new Error("TOO_LARGE");

    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- route ----
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json(
      { error: "Unsupported protocol" },
      { status: 400 }
    );
  }

  if (isBlockedHost(parsed.hostname)) {
    return NextResponse.json({ error: "Blocked host" }, { status: 400 });
  }

  // 1) 캐시 조회
  const { data: cached, error: cacheErr } = await supabase
    .from("link_previews")
    .select("url,title,fetched_at,published_at,description")
    .eq("url", url)
    .maybeSingle();

  if (cacheErr) {
    // 캐시 에러가 나도 기능은 계속 동작하게 (운영 편의)
    // console.error(cacheErr);
  }

  if (cached?.title && cached?.fetched_at) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    if (age < TTL_MS) {
      return NextResponse.json({
        title: cached.title,
        cached: true,
        published_at: cached.published_at,
        description: cached.description,
      });
    }
  }

  // 2) fetch + parse
  try {
    const html = await fetchHtml(url);
    const title = extractTitle(html);
    const publishedDate = extractPublishedDate(html);
    const description = extractDescription(html);

    // 3) 캐시 저장 (title이 null이어도 저장해두면 같은 URL 반복 호출 방지 가능)
    await supabase.from("link_previews").upsert({
      url,
      title,
      fetched_at: new Date().toISOString(),
      published_at: publishedDate,
      description: description ?? null,
    });

    return NextResponse.json({
      title,
      cached: false,
      published_at: publishedDate,
      description: description ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch preview" },
      { status: 502 }
    );
  }
}
