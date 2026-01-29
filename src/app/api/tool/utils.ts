import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { logger } from "@/utils/logger";

export type PreprocessResult = {
    url: string;
    title: string;
    markdown: string;
    links: Array<{ text: string; url: string }>;
    excerpt?: string;
};

type Options = {
    maxLinks?: number;          // default 80
    stripTracking?: boolean;    // default true (removes utm_* and common tracking params)
    keepImageLinks?: boolean;   // default false (keeps <img> as markdown images if true)
};

const DEFAULT_TRACKING_KEYS = [
    /^utm_/i,
    /^fbclid$/i,
    /^gclid$/i,
    /^gbraid$/i,
    /^wbraid$/i,
    /^mc_cid$/i,
    /^mc_eid$/i,
    /^igshid$/i,
    /^ref$/i,
    /^ref_src$/i,
    /^spm$/i,
    /^yclid$/i,
    /^_hsenc$/i,
    /^_hsmi$/i,
];

function normalizeUrl(rawHref: string, baseUrl: string, stripTracking: boolean): string | null {
    try {
        const u = new URL(rawHref, baseUrl);

        // Drop fragments (usually not useful for retrieval; keep if you want deep anchors)
        u.hash = "";

        if (stripTracking) {
            const keys = Array.from(u.searchParams.keys());
            for (const k of keys) {
                if (DEFAULT_TRACKING_KEYS.some((re) => re.test(k))) u.searchParams.delete(k);
            }
        }

        // Normalize trailing slash (optional). Keep it simple:
        // If path is "/" keep it, otherwise remove trailing slash.
        if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");

        return u.toString();
    } catch {
        return null;
    }
}

function uniqByUrl(links: Array<{ text: string; url: string }>) {
    const seen = new Set<string>();
    const out: Array<{ text: string; url: string }> = [];
    for (const l of links) {
        if (seen.has(l.url)) continue;
        seen.add(l.url);
        out.push(l);
    }
    return out;
}

function cleanDomBeforeReadability(doc: Document) {
    // Remove common noise before Readability runs.
    const selectors = [
        "script",
        "style",
        "noscript",
        "svg",
        "canvas",
        "iframe",
        "form",
        "button",
        "input",
        "select",
        "textarea",
        "nav",
        "footer",
        "header",
        "aside",
        // Common cookie/ads/modals (best-effort)
        "[aria-modal='true']",
        "[role='dialog']",
        "[id*='cookie' i]",
        "[class*='cookie' i]",
        "[id*='consent' i]",
        "[class*='consent' i]",
        "[id*='modal' i]",
        "[class*='modal' i]",
        "[class*='popup' i]",
        "[id*='popup' i]",
        "[class*='advert' i]",
        "[id*='advert' i]",
    ];
    doc.querySelectorAll(selectors.join(",")).forEach((el) => el.remove());
}

function extractLinksFromHtml(html: string, baseUrl: string, stripTracking: boolean) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const raw = Array.from(doc.querySelectorAll("a[href]"))
        .map((a) => {
            const href = a.getAttribute("href")?.trim() ?? "";
            const text = (a.textContent ?? "").replace(/\s+/g, " ").trim();
            const normalized = normalizeUrl(href, baseUrl, stripTracking);
            return normalized ? { text, url: normalized } : null;
        })
        .filter(Boolean) as Array<{ text: string; url: string }>;

    // Filter out meaningless anchor text if you want (optional). Keep mostly all.
    const filtered = raw.filter((l) => l.url && l.url !== baseUrl);

    return uniqByUrl(filtered);
}

function buildMarkdown(title: string, sourceUrl: string, bodyMd: string, links: Array<{ text: string; url: string }>, maxLinks: number) {
    const topLinks = links.slice(0, maxLinks);

    const linksMd =
        topLinks.length === 0
            ? ""
            : `\n\n---\n\n## Links\n${topLinks
                .map((l) => {
                    const label = l.text && l.text.length <= 120 ? l.text : l.url;
                    return `- [${label.replace(/\]/g, "\\]")} ](${l.url})`.replace("[ ", "["); // tiny cleanup
                })
                .join("\n")}`;

    return `# ${title || "Untitled"}\n\nSource: ${sourceUrl}\n\n---\n\n${bodyMd.trim()}${linksMd}\n`;
}

/**
 * Takes raw HTML and a canonical page URL, returns LLM-friendly Markdown + normalized links.
 */
export function htmlToReadableMarkdown(html: string, pageUrl: string, opts: Options = {}): PreprocessResult {
    logger.log("\n\n 찾아온 내용 ", html, "\n\n")
    const {
        maxLinks = 80,
        stripTracking = true,
        keepImageLinks = false,
    } = opts;

    const dom = new JSDOM(html, { url: pageUrl });
    const doc = dom.window.document;

    cleanDomBeforeReadability(doc);

    const reader = new Readability(doc);
    const article = reader.parse();

    // Fallback: if Readability fails, use the whole body text (still cleaned).
    const title = article?.title?.trim() || doc.title?.trim() || "Untitled";
    const contentHtml = article?.content || doc.body?.innerHTML || "";
    const excerpt = article?.excerpt?.trim();

    // Extract links from *article content* (not full page).
    const links = extractLinksFromHtml(contentHtml, pageUrl, stripTracking);

    // Convert to Markdown
    const turndown = new TurndownService({
        headingStyle: "atx",
        codeBlockStyle: "fenced",
        bulletListMarker: "-",
        emDelimiter: "*",
        strongDelimiter: "**",
    });

    if (!keepImageLinks) {
        // Drop images entirely
        turndown.remove(["img", "picture", "source", "video", "audio"]);
    }

    // Keep links as markdown links; also normalize them.
    turndown.addRule("normalizeLinks", {
        filter: (node) => node.nodeName === "A",
        replacement: (content, node) => {
            const el = node as HTMLAnchorElement;
            const rawHref = el.getAttribute("href") ?? "";
            const normalized = normalizeUrl(rawHref, pageUrl, stripTracking);
            const text = (content || el.textContent || "").replace(/\s+/g, " ").trim();
            if (!normalized) return text || "";
            const label = text || normalized;
            return `[${label.replace(/\]/g, "\\]")}](${normalized})`;
        },
    });

    // Remove super-noisy empty lines after conversion
    const bodyMd = turndown.turndown(contentHtml).replace(/\n{3,}/g, "\n\n").trim();

    const markdown = buildMarkdown(title, pageUrl, bodyMd, links, maxLinks);

    return {
        url: pageUrl,
        title,
        markdown,
        links,
        excerpt,
    };
}
