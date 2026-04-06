import type { NextRequest } from "next/server";
import { xaiInference } from "@/lib/llm/llm";
import {
  ATS_EMAIL_DISCOVERY_OPERATION_LIMIT,
  type AtsCandidateDetail,
  type AtsCandidatePublication,
  type AtsEmailDiscoveryEvidence,
  type AtsEmailDiscoveryTraceItem,
  type AtsEmailSourceType,
  isValidEmail,
  normalizeEmail,
} from "@/lib/ats/shared";

type SearchResult = {
  content?: string;
  title?: string;
  url: string;
};

type ScrapeResult = {
  error?: string;
  markdown?: string;
  status?: number;
  title?: string;
  url: string;
};

type UrlCandidateSource =
  | "candid_link"
  | "publication"
  | "company_link"
  | "github"
  | "blog"
  | "homepage"
  | "arxiv_pdf"
  | "derived_pdf"
  | "search_result"
  | "scraped_page_link";

type UrlCandidate = {
  discoveredFrom: string;
  label: string;
  priorityHint: number;
  priorityReason: string;
  readMode: "full" | "pdf_first_page";
  source: UrlCandidateSource;
  url: string;
};

type UrlMemoryEntry = UrlCandidate & {
  attempts: number;
  lastTitle: string | null;
  status: "failed" | "pending" | "scraped";
};

type PageEmailFinding = {
  confidence: "high" | "medium" | "low";
  email: string;
  evidenceSnippet: string;
  rationale: string;
};

type SearchRecord = {
  query: string;
  results: SearchResult[];
};

type ScrapeRecord = {
  discoveredUrls: string[];
  error: string | null;
  findings: PageEmailFinding[];
  readMode: "full" | "pdf_first_page";
  status: "failed" | "found_email" | "no_email";
  title: string | null;
  url: string;
};

type PlannerTool = "finish" | "scrape_url" | "search_web";

type PlannerAction = {
  query?: string;
  readMode?: "full" | "pdf_first_page";
  reason: string;
  tool: PlannerTool;
  url?: string;
};

type PlannerDecision = {
  action?: Partial<PlannerAction> | null;
  thinking?: string;
};

type EmailFinderResult = {
  bestEmail: string | null;
  confidence: "high" | "medium" | "low";
  evidence: AtsEmailDiscoveryEvidence[];
  sourceLabel: string | null;
  sourceType: AtsEmailSourceType | null;
  sourceUrl: string | null;
  status: "found" | "not_found" | "error";
  summary: string | null;
  trace: AtsEmailDiscoveryTraceItem[];
};

type OperationKind = "llm" | "search";
type EmailDiscoveryTraceListener = (
  trace: AtsEmailDiscoveryTraceItem[]
) => void | Promise<void>;

const GENERIC_EMAIL_PREFIXES = new Set([
  "admin",
  "contact",
  "hello",
  "hi",
  "info",
  "jobs",
  "mail",
  "noreply",
  "no-reply",
  "office",
  "press",
  "recruiting",
  "support",
  "team",
]);

function safeParseJson(raw: string) {
  const text = raw.trim();
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function addTrace(
  trace: AtsEmailDiscoveryTraceItem[],
  kind: AtsEmailDiscoveryTraceItem["kind"],
  content: string,
  meta?: Record<string, unknown> | null,
  onTrace?: EmailDiscoveryTraceListener | null
) {
  trace.push({
    at: new Date().toISOString(),
    content,
    kind,
    meta: meta ?? null,
  });

  if (onTrace) {
    const snapshot = trace.slice();
    void Promise.resolve(onTrace(snapshot)).catch((error) => {
      console.error("[ats-email-finder] failed to publish trace", error);
    });
  }
}

function makeBudgetController(
  trace: AtsEmailDiscoveryTraceItem[],
  onTrace?: EmailDiscoveryTraceListener | null
) {
  const counts: Record<OperationKind, number> = {
    llm: 0,
    search: 0,
  };
  let total = 0;
  let exhausted = false;

  const getMeta = () => ({
    limit: ATS_EMAIL_DISCOVERY_OPERATION_LIMIT,
    llmCalls: counts.llm,
    remaining: Math.max(0, ATS_EMAIL_DISCOVERY_OPERATION_LIMIT - total),
    searchCalls: counts.search,
    total,
  });

  return {
    consume(kind: OperationKind, meta?: Record<string, unknown> | null) {
      if (total >= ATS_EMAIL_DISCOVERY_OPERATION_LIMIT) {
        if (!exhausted) {
          exhausted = true;
          addTrace(
            trace,
            "decision",
            `LLM 호출 + URL 조회 한도 ${ATS_EMAIL_DISCOVERY_OPERATION_LIMIT}회에 도달하여 탐색을 중단합니다.`,
            {
              ...getMeta(),
              nextOperation: kind,
              ...(meta ?? {}),
            },
            onTrace
          );
        }
        return false;
      }

      total += 1;
      counts[kind] += 1;
      return true;
    },
    isExhausted() {
      return exhausted;
    },
    meta() {
      return getMeta();
    },
  };
}

function makeInternalUrl(req: NextRequest, path: string) {
  const base = new URL(req.url);
  base.pathname = path;
  base.search = "";
  base.hash = "";
  return base.toString();
}

function normalizeUrl(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

function canonicalizeUrl(value: string | null | undefined) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    url.hash = "";
    return url.toString();
  } catch {
    return normalized;
  }
}

function normalizeQuery(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isBlockedDomain(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return host.includes("linkedin.com") || host.includes("scholar.google.com");
  } catch {
    return false;
  }
}

function isPdfLikeUrl(url: string) {
  const normalized = canonicalizeUrl(url).toLowerCase();
  return normalized.endsWith(".pdf") || normalized.includes("arxiv.org/pdf/");
}

function inferReadMode(url: string): "full" | "pdf_first_page" {
  return isPdfLikeUrl(url) ? "pdf_first_page" : "full";
}

function isLikelyPersonalOrAcademicPage(url: string) {
  const normalized = canonicalizeUrl(url).toLowerCase();
  return (
    normalized.includes(".edu") ||
    normalized.includes(".ac.") ||
    normalized.includes("faculty") ||
    normalized.includes("people") ||
    normalized.includes("person") ||
    normalized.includes("profile") ||
    normalized.includes("homepage") ||
    normalized.includes("/~") ||
    normalized.includes("lab") ||
    normalized.includes("about") ||
    normalized.includes("contact") ||
    normalized.includes("github.io")
  );
}

function toArxivPdfUrl(input: string) {
  const url = canonicalizeUrl(input);
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (!host.includes("arxiv.org")) return null;

    if (parsed.pathname.startsWith("/pdf/")) {
      return parsed.toString().endsWith(".pdf")
        ? parsed.toString()
        : `${parsed.toString()}.pdf`;
    }

    if (parsed.pathname.startsWith("/abs/")) {
      parsed.pathname = parsed.pathname.replace(/^\/abs\//, "/pdf/");
      const pdfUrl = parsed.toString();
      return pdfUrl.endsWith(".pdf") ? pdfUrl : `${pdfUrl}.pdf`;
    }

    return null;
  } catch {
    return null;
  }
}

function confidenceScore(value: "high" | "medium" | "low") {
  if (value === "high") return 3;
  if (value === "medium") return 2;
  return 1;
}

function evidenceRank(item: AtsEmailDiscoveryEvidence) {
  const typeBonus =
    item.type === "direct"
      ? 40
      : item.type === "pdf"
        ? 30
        : item.type === "page"
          ? 20
          : 10;
  const domainBonus =
    typeof item.url === "string" && item.url.toLowerCase().includes(".edu")
      ? 5
      : 0;
  return confidenceScore(item.confidence) * 100 + typeBonus + domainBonus;
}

function mergeEvidence(
  current: AtsEmailDiscoveryEvidence[],
  incoming: AtsEmailDiscoveryEvidence[]
) {
  const map = new Map<string, AtsEmailDiscoveryEvidence>();

  for (const item of [...current, ...incoming]) {
    const key = `${normalizeEmail(item.email)}::${canonicalizeUrl(item.url) || item.type}`;
    const prev = map.get(key);
    if (!prev || evidenceRank(item) > evidenceRank(prev)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => evidenceRank(b) - evidenceRank(a)
  );
}

function pickBestEvidence(
  evidence: AtsEmailDiscoveryEvidence[],
  minimumConfidence: "high" | "medium" | "low" = "low"
) {
  const minScore = confidenceScore(minimumConfidence);
  return (
    evidence
      .slice()
      .sort((a, b) => evidenceRank(b) - evidenceRank(a))
      .find((item) => confidenceScore(item.confidence) >= minScore) ?? null
  );
}

function extractEmailsFromText(value: string | null | undefined) {
  const text = String(value ?? "");
  const matches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const deduped = new Set<string>();

  return matches
    .map((email) => normalizeEmail(email))
    .filter((email) => {
      if (!isValidEmail(email)) return false;
      if (email.endsWith("@users.noreply.github.com")) return false;
      const prefix = email.split("@")[0] ?? "";
      return !GENERIC_EMAIL_PREFIXES.has(prefix);
    })
    .filter((email) => {
      if (deduped.has(email)) return false;
      deduped.add(email);
      return true;
    });
}

function buildSnippetAroundEmail(text: string, email: string) {
  const normalizedText = String(text ?? "");
  const idx = normalizedText.toLowerCase().indexOf(email.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - 120);
  const end = Math.min(normalizedText.length, idx + email.length + 120);
  return normalizedText.slice(start, end).replace(/\s+/g, " ").trim();
}

function parseYear(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).getUTCFullYear();
  }
  const match = String(value).match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function scorePublication(publication: AtsCandidatePublication, index: number) {
  const citationCount = publication.citationCount ?? 0;
  const year = parseYear(publication.publishedAt);
  const currentYear = new Date().getUTCFullYear();
  const recencyBoost =
    year == null
      ? 0
      : Math.max(0, Math.min(18, 18 - Math.max(0, currentYear - year) * 2));
  const citationBoost = Math.max(
    0,
    Math.min(25, Math.floor(citationCount / 10) * 3)
  );
  return Math.max(0, 30 - index * 2) + recencyBoost + citationBoost;
}

function getPrioritizedPublications(candidate: AtsCandidateDetail) {
  return candidate.publications
    .map((publication, index) => ({
      publication,
      score: scorePublication(publication, index),
    }))
    .sort((a, b) => b.score - a.score);
}

function dedupeUrlCandidates(candidates: UrlCandidate[]) {
  const map = new Map<string, UrlCandidate>();

  for (const candidate of candidates) {
    const key = canonicalizeUrl(candidate.url);
    if (!key) continue;

    const normalized = {
      ...candidate,
      priorityHint: Math.max(
        1,
        Math.min(100, Math.round(candidate.priorityHint))
      ),
      url: key,
    } satisfies UrlCandidate;

    const prev = map.get(key);
    if (!prev || normalized.priorityHint > prev.priorityHint) {
      map.set(key, normalized);
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => b.priorityHint - a.priorityHint
  );
}

function addDerivedPdfCandidates(base: UrlCandidate) {
  const derived: UrlCandidate[] = [base];
  const arxivPdfUrl = toArxivPdfUrl(base.url);

  if (arxivPdfUrl && !isBlockedDomain(arxivPdfUrl)) {
    derived.push({
      ...base,
      label: `${base.label} (arXiv PDF)`,
      priorityHint: Math.min(100, base.priorityHint + 12),
      priorityReason: `${base.priorityReason}; arXiv PDF를 직접 읽을 수 있음`,
      readMode: "pdf_first_page",
      source: "arxiv_pdf",
      url: arxivPdfUrl,
    });
  }

  if (base.url.toLowerCase().endsWith(".pdf")) {
    derived.push({
      ...base,
      label: `${base.label} (pdf_first_page)`,
      priorityHint: Math.min(100, base.priorityHint + 8),
      priorityReason: `${base.priorityReason}; 직접 PDF`,
      readMode: "pdf_first_page",
      source: base.source === "search_result" ? "derived_pdf" : base.source,
    });
  }

  return dedupeUrlCandidates(derived);
}

function collectSeedUrlCandidates(candidate: AtsCandidateDetail) {
  const candidates: UrlCandidate[] = [];
  const prioritizedPublications = getPrioritizedPublications(candidate);

  const push = (candidateInput: UrlCandidate | null) => {
    if (!candidateInput) return;
    const url = canonicalizeUrl(candidateInput.url);
    if (!url || isBlockedDomain(url)) return;

    candidates.push(
      ...addDerivedPdfCandidates({
        ...candidateInput,
        readMode: candidateInput.readMode ?? inferReadMode(url),
        url,
      })
    );
  };

  for (const link of candidate.links ?? []) {
    const url = canonicalizeUrl(link);
    if (!url) continue;
    const personalBoost = isLikelyPersonalOrAcademicPage(url) ? 12 : 0;
    push({
      discoveredFrom: "candidate.links",
      label: "candidate.links",
      priorityHint: 58 + personalBoost + (isPdfLikeUrl(url) ? 15 : 0),
      priorityReason:
        personalBoost > 0
          ? "후보자 프로필에 직접 연결된 개인/학술 페이지일 가능성이 높음"
          : "후보자 프로필에 직접 연결된 공개 링크",
      readMode: inferReadMode(url),
      source: "candid_link",
      url,
    });
  }

  prioritizedPublications.forEach(({ publication, score }, index) => {
    const url = canonicalizeUrl(publication.link);
    if (!url) return;
    const reasonParts = [
      "논문 링크",
      score >= 50
        ? "최신/인용수 기준으로 우선순위가 높은 논문"
        : "논문 PDF에서 이메일이 발견될 가능성이 있음",
    ];
    const year = parseYear(publication.publishedAt);
    if (year != null) reasonParts.push(`year=${year}`);
    if ((publication.citationCount ?? 0) > 0) {
      reasonParts.push(`citations=${publication.citationCount}`);
    }

    push({
      discoveredFrom: "candidate.publications",
      label: `publication: ${publication.title || `paper ${index + 1}`}`,
      priorityHint: 68 + Math.min(24, score),
      priorityReason: reasonParts.join(", "),
      readMode: inferReadMode(url),
      source: "publication",
      url,
    });
  });

  for (const companyLink of candidate.companyLinks ?? []) {
    const url = canonicalizeUrl(companyLink);
    if (!url) continue;
    push({
      discoveredFrom: "candidate.companyLinks",
      label: "candidate.companyLinks",
      priorityHint: 24 + (isLikelyPersonalOrAcademicPage(url) ? 8 : 0),
      priorityReason: "경력 정보에 연결된 회사/프로필 링크",
      readMode: inferReadMode(url),
      source: "company_link",
      url,
    });
  }

  if (candidate.githubProfile?.githubUrl) {
    push({
      discoveredFrom: "github_profile.githubUrl",
      label: "github_profile.githubUrl",
      priorityHint: 42,
      priorityReason:
        "GitHub 프로필 또는 pinned/readme에 공개 이메일이 있을 수 있음",
      readMode: inferReadMode(candidate.githubProfile.githubUrl),
      source: "github",
      url: candidate.githubProfile.githubUrl,
    });
  }

  if (candidate.githubProfile?.blog) {
    push({
      discoveredFrom: "github_profile.blog",
      label: "github_profile.blog",
      priorityHint: 55,
      priorityReason: "GitHub에 연결된 개인 블로그/홈페이지일 가능성이 있음",
      readMode: inferReadMode(candidate.githubProfile.blog),
      source: "blog",
      url: candidate.githubProfile.blog,
    });
  }

  if (candidate.scholarProfile?.homepageLink) {
    push({
      discoveredFrom: "scholar_profile.homepageLink",
      label: "scholar_profile.homepageLink",
      priorityHint: 66,
      priorityReason: "Scholar에 연결된 개인 홈페이지 또는 연구실 페이지",
      readMode: inferReadMode(candidate.scholarProfile.homepageLink),
      source: "homepage",
      url: candidate.scholarProfile.homepageLink,
    });
  }

  return dedupeUrlCandidates(candidates);
}

function upsertUrlPool(
  pool: Map<string, UrlMemoryEntry>,
  candidates: UrlCandidate[]
) {
  for (const candidate of dedupeUrlCandidates(candidates)) {
    const key = canonicalizeUrl(candidate.url);
    if (!key || isBlockedDomain(key)) continue;

    const prev = pool.get(key);
    if (!prev) {
      pool.set(key, {
        ...candidate,
        attempts: 0,
        lastTitle: null,
        status: "pending",
        url: key,
      });
      continue;
    }

    pool.set(key, {
      ...prev,
      discoveredFrom:
        candidate.priorityHint > prev.priorityHint
          ? candidate.discoveredFrom
          : prev.discoveredFrom,
      label:
        candidate.priorityHint > prev.priorityHint
          ? candidate.label
          : prev.label,
      priorityHint: Math.max(prev.priorityHint, candidate.priorityHint),
      priorityReason:
        candidate.priorityHint > prev.priorityHint
          ? candidate.priorityReason
          : prev.priorityReason,
      readMode:
        candidate.readMode === "pdf_first_page" ||
        prev.readMode === "pdf_first_page"
          ? "pdf_first_page"
          : "full",
      source:
        candidate.priorityHint > prev.priorityHint
          ? candidate.source
          : prev.source,
      url: key,
    });
  }
}

function getPendingUrls(pool: Map<string, UrlMemoryEntry>) {
  return Array.from(pool.values())
    .filter((item) => item.status === "pending")
    .sort((a, b) => {
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      return b.priorityHint - a.priorityHint;
    });
}

function extractLinkedUrlsFromMarkdown(markdown: string) {
  const urls: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  const linkRegex = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
  const rawUrlRegex = /https?:\/\/[^\s)>\]]+/g;

  for (const match of Array.from(markdown.matchAll(linkRegex))) {
    const url = canonicalizeUrl(match[2]);
    if (!url || seen.has(url) || isBlockedDomain(url)) continue;
    seen.add(url);
    urls.push({
      label: String(match[1] ?? "").trim() || url,
      url,
    });
  }

  for (const match of markdown.match(rawUrlRegex) ?? []) {
    const url = canonicalizeUrl(match);
    if (!url || seen.has(url) || isBlockedDomain(url)) continue;
    seen.add(url);
    urls.push({
      label: url,
      url,
    });
  }

  return urls;
}

function buildCandidatesFromDiscoveredLinks(args: {
  candidate: AtsCandidateDetail;
  links: Array<{ label: string; url: string }>;
  parentUrl: string;
}) {
  const publicationTitles = getPrioritizedPublications(args.candidate).map(
    ({ publication }) => publication.title.toLowerCase()
  );

  return dedupeUrlCandidates(
    args.links.map((link) => {
      const url = canonicalizeUrl(link.url);
      const label = String(link.label ?? "").trim() || url;
      const lower = `${label} ${url}`.toLowerCase();
      let priorityHint = 28;
      const reasons = [`${args.parentUrl} 에서 발견한 링크`];

      if (isPdfLikeUrl(url)) {
        priorityHint += 26;
        reasons.push("직접 PDF");
      }

      if (isLikelyPersonalOrAcademicPage(url)) {
        priorityHint += 14;
        reasons.push("개인/학교/연구실 페이지 가능성");
      }

      if (
        lower.includes("cv") ||
        lower.includes("resume") ||
        lower.includes("publication") ||
        lower.includes("paper") ||
        lower.includes("contact") ||
        lower.includes("about")
      ) {
        priorityHint += 10;
        reasons.push("email 또는 논문으로 이어질 가능성이 있는 링크");
      }

      if (publicationTitles.some((title) => title && lower.includes(title))) {
        priorityHint += 18;
        reasons.push("후보자 논문 제목과 연결됨");
      }

      return {
        discoveredFrom: `scraped:${args.parentUrl}`,
        label: label.slice(0, 140),
        priorityHint: Math.min(100, priorityHint),
        priorityReason: reasons.join(", "),
        readMode: inferReadMode(url),
        source: "scraped_page_link" as const,
        url,
      } satisfies UrlCandidate;
    })
  );
}

function buildCandidatesFromSearchResults(args: {
  candidate: AtsCandidateDetail;
  query: string;
  results: SearchResult[];
}) {
  const publications = getPrioritizedPublications(args.candidate);
  const publicationTitles = publications.map(({ publication }) =>
    publication.title.toLowerCase()
  );

  return dedupeUrlCandidates(
    args.results.map((result) => {
      const url = canonicalizeUrl(result.url);
      const text =
        `${result.title ?? ""} ${result.content ?? ""} ${url}`.toLowerCase();
      let priorityHint = 34;
      const reasons = [`검색어 "${args.query}" 결과`];

      if (isPdfLikeUrl(url)) {
        priorityHint += 28;
        reasons.push("직접 PDF");
      }

      if (url.toLowerCase().includes("arxiv.org")) {
        priorityHint += 16;
        reasons.push("arXiv");
      }

      if (isLikelyPersonalOrAcademicPage(url)) {
        priorityHint += 12;
        reasons.push("개인/학술 페이지 가능성");
      }

      const matchedPublication = publicationTitles.find(
        (title) => title && text.includes(title)
      );
      if (matchedPublication) {
        priorityHint += 24;
        reasons.push("후보자 논문 제목과 매칭");
      }

      return {
        discoveredFrom: `search:${args.query}`,
        label:
          String(result.title ?? "").trim() ||
          `search result for ${args.query}`,
        priorityHint: Math.min(100, priorityHint),
        priorityReason: reasons.join(", "),
        readMode: inferReadMode(url),
        source: "search_result" as const,
        url,
      } satisfies UrlCandidate;
    })
  );
}

function buildSearchSnippetEvidence(results: SearchResult[]) {
  const evidence: AtsEmailDiscoveryEvidence[] = [];

  for (const result of results) {
    const text = `${result.title ?? ""}\n${result.content ?? ""}`;
    for (const email of extractEmailsFromText(text)) {
      evidence.push({
        confidence: "low",
        email,
        snippet: buildSnippetAroundEmail(text, email) ?? text.slice(0, 240),
        title: result.title ?? null,
        type: "search",
        url: canonicalizeUrl(result.url) || null,
      });
    }
  }

  return mergeEvidence([], evidence);
}

async function callWebSearch(
  req: NextRequest,
  query: string
): Promise<SearchResult[]> {
  const url = makeInternalUrl(req, "/api/tool/web_search");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const rawError = await response.text().catch(() => "");
    let detail = rawError.trim();

    if (detail) {
      try {
        const parsed = JSON.parse(detail) as {
          error?: unknown;
          message?: unknown;
        };
        if (typeof parsed.error === "string" && parsed.error.trim()) {
          detail = parsed.error.trim();
        } else if (
          typeof parsed.message === "string" &&
          parsed.message.trim()
        ) {
          detail = parsed.message.trim();
        }
      } catch {
        detail = rawError.trim();
      }
    }

    throw new Error(
      detail
        ? `web_search failed (${response.status}): ${detail}`
        : `web_search failed (${response.status})`
    );
  }

  const payload = (await response.json().catch(() => [])) as
    | SearchResult[]
    | { response?: SearchResult[] };
  const results = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.response)
      ? payload.response
      : [];

  return results
    .map((result) => ({
      content: String(result.content ?? "").trim(),
      title: String(result.title ?? "").trim(),
      url: canonicalizeUrl(result.url),
    }))
    .filter((result) => Boolean(result.url) && !isBlockedDomain(result.url))
    .slice(0, 8);
}

async function callScrape(
  req: NextRequest,
  args: { readMode: "full" | "pdf_first_page"; url: string }
): Promise<ScrapeResult | null> {
  const internalUrl = makeInternalUrl(req, "/api/tool/scrape");
  const response = await fetch(internalUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pdfPageLimit: args.readMode === "pdf_first_page" ? 1 : undefined,
      url: args.url,
    }),
  });

  const payload = (await response
    .json()
    .catch(() => ({}))) as Partial<ScrapeResult>;

  if (!response.ok) {
    return {
      error:
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error.trim()
          : `scrape failed (${response.status})`,
      status: response.status,
      url: args.url,
    };
  }

  return typeof payload.url === "string" && payload.url.trim()
    ? (payload as ScrapeResult)
    : {
        error: "scrape returned empty payload",
        status: response.status,
        url: args.url,
      };
}

async function extractEmailsFromPageWithLlm(args: {
  candidate: AtsCandidateDetail;
  markdown: string;
  pageTitle?: string | null;
  pageUrl: string;
  readMode: "full" | "pdf_first_page";
}) {
  const content = String(args.markdown ?? "").slice(0, 18000);

  const systemPrompt = `You extract candidate email addresses from a public webpage or PDF text.

Return JSON only:
{
  "findings": [
    {
      "email": string,
      "confidence": "high" | "medium" | "low",
      "evidenceSnippet": string,
      "rationale": string
    }
  ]
}

Rules:
- Only return public email addresses that are explicitly present in the provided text.
- Do not infer or fabricate an email.
- High confidence only when the page clearly ties the email to the candidate by name, author list, homepage ownership, profile ownership, or obvious self-identification.
- Prefer personal email over generic inboxes.
- Generic inboxes like info@, contact@, hello@, admin@, support@, team@ should usually be ignored unless the page clearly identifies it as the candidate's direct contact.
- For a paper PDF first page, author block or footnotes can strongly indicate the correct email.
- If nothing convincing is present, return an empty findings array.`;

  const userPrompt = `Candidate:
- name: ${args.candidate.name ?? ""}
- headline: ${args.candidate.headline ?? ""}
- current company: ${args.candidate.currentCompany ?? ""}
- current school: ${args.candidate.currentSchool ?? ""}
- scholar affiliation: ${args.candidate.scholarAffiliation ?? ""}
- github username: ${args.candidate.githubUsername ?? ""}

Page metadata:
- url: ${args.pageUrl}
- title: ${args.pageTitle ?? ""}
- readMode: ${args.readMode}

Page text:
${content}`;

  const raw = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt,
    0.1
  );

  const parsed = safeParseJson(raw) as {
    findings?: Array<{
      confidence?: "high" | "medium" | "low";
      email?: string;
      evidenceSnippet?: string;
      rationale?: string;
    }>;
  } | null;

  return (parsed?.findings ?? [])
    .map((item) => {
      const email = normalizeEmail(String(item.email ?? "").trim());
      if (!isValidEmail(email)) return null;

      return {
        confidence:
          item.confidence === "high" ||
          item.confidence === "medium" ||
          item.confidence === "low"
            ? item.confidence
            : "low",
        email,
        evidenceSnippet: String(item.evidenceSnippet ?? "").trim(),
        rationale: String(item.rationale ?? "").trim(),
      } satisfies PageEmailFinding;
    })
    .filter(Boolean) as PageEmailFinding[];
}

function evidenceFromFinding(args: {
  finding: PageEmailFinding;
  readMode: "full" | "pdf_first_page";
  title?: string | null;
  url: string;
}): AtsEmailDiscoveryEvidence {
  return {
    confidence: args.finding.confidence,
    email: args.finding.email,
    snippet: args.finding.evidenceSnippet || args.finding.rationale || null,
    title: args.title ?? null,
    type: args.readMode === "pdf_first_page" ? "pdf" : "page",
    url: args.url,
  };
}

function buildCandidatePrompt(candidate: AtsCandidateDetail) {
  const publications = getPrioritizedPublications(candidate)
    .slice(0, 5)
    .map(({ publication, score }, index) => {
      const year = parseYear(publication.publishedAt);
      return `${index + 1}. score=${score} | title=${publication.title} | year=${
        year ?? publication.publishedAt ?? ""
      } | citations=${publication.citationCount ?? 0} | link=${publication.link ?? ""}`;
    })
    .join("\n");

  const experience = candidate.experience
    .slice(0, 3)
    .map((item, index) => {
      return `${index + 1}. ${item.role ?? ""} @ ${item.company ?? ""} (${item.startDate ?? ""} ~ ${item.endDate ?? "current"})`;
    })
    .join("\n");

  return `Candidate:
- name: ${candidate.name ?? ""}
- headline: ${candidate.headline ?? ""}
- bio: ${String(candidate.bio ?? "").slice(0, 1200)}
- current company: ${candidate.currentCompany ?? ""}
- current school: ${candidate.currentSchool ?? ""}
- scholar affiliation: ${candidate.scholarAffiliation ?? ""}
- github username: ${candidate.githubUsername ?? ""}
- github url: ${candidate.githubUrl ?? ""}
- scholar homepage: ${candidate.scholarProfile?.homepageLink ?? ""}

Top experience:
${experience || "(none)"}

Priority publications for email lookup:
${publications || "(none)"}`;
}

function buildMemoryPrompt(args: {
  actionHistory: string[];
  budgetMeta: ReturnType<ReturnType<typeof makeBudgetController>["meta"]>;
  evidence: AtsEmailDiscoveryEvidence[];
  scrapeHistory: ScrapeRecord[];
  searchHistory: SearchRecord[];
  urlPool: Map<string, UrlMemoryEntry>;
}) {
  const pendingUrls = getPendingUrls(args.urlPool)
    .slice(0, 15)
    .map((item, index) => {
      return `${index + 1}. priority=${item.priorityHint} | readMode=${item.readMode} | source=${
        item.source
      } | url=${item.url} | reason=${item.priorityReason}`;
    })
    .join("\n");

  const searchHistory = args.searchHistory
    .slice(-5)
    .map((item, index) => {
      const topResults = item.results
        .slice(0, 3)
        .map((result, resultIndex) => {
          return `${resultIndex + 1}) ${result.title || "Untitled"} | ${result.url}`;
        })
        .join(" ; ");
      return `${index + 1}. query="${item.query}" | results=${item.results.length} | top=${topResults}`;
    })
    .join("\n");

  const scrapeHistory = args.scrapeHistory
    .slice(-8)
    .map((item, index) => {
      const findings = item.findings
        .map((finding) => `${finding.email}(${finding.confidence})`)
        .join(", ");
      return `${index + 1}. ${item.status} | readMode=${item.readMode} | url=${item.url} | title=${
        item.title ?? ""
      } | findings=${findings || "none"} | discoveredUrls=${item.discoveredUrls.length}`;
    })
    .join("\n");

  const evidence = args.evidence
    .slice(0, 8)
    .map((item, index) => {
      return `${index + 1}. ${item.email} | confidence=${item.confidence} | type=${item.type} | url=${
        item.url ?? ""
      } | title=${item.title ?? ""}`;
    })
    .join("\n");

  return `Memory:
- budget: used=${args.budgetMeta.total}, remaining=${args.budgetMeta.remaining}, llmCalls=${args.budgetMeta.llmCalls}, searchCalls=${args.budgetMeta.searchCalls}

Recent actions:
${args.actionHistory.slice(-10).join("\n") || "(none)"}

Search history:
${searchHistory || "(none)"}

Scrape history:
${scrapeHistory || "(none)"}

Current URLs (highest priority first):
${pendingUrls || "(none)"}

Email evidence so far:
${evidence || "(none)"}`;
}

async function planNextAction(args: {
  actionHistory: string[];
  budgetMeta: ReturnType<ReturnType<typeof makeBudgetController>["meta"]>;
  candidate: AtsCandidateDetail;
  evidence: AtsEmailDiscoveryEvidence[];
  scrapeHistory: ScrapeRecord[];
  searchHistory: SearchRecord[];
  step: number;
  urlPool: Map<string, UrlMemoryEntry>;
}) {
  const systemPrompt = `You are operating an agentic public-email finder for a recruiter.

There is one shared memory. At each step, read the candidate info and current memory, then choose exactly one tool action.

Available tools:
1. search_web(query)
   - Use this to discover better URLs.
   - Especially useful for finding direct paper PDFs, arXiv PDFs, university profile pages, personal homepages, lab pages, and author pages.
2. scrape_url(url, readMode)
   - This reads the public page or PDF.
   - After scraping, the system will automatically run email extraction on the page text and store any new evidence.
3. finish(reason)
   - Stop when you have enough evidence or when the remaining options are weak.

Important research heuristics:
- The candidate's paper PDFs are often the highest-value source because the actual email may only appear inside the PDF author block, footnote, or first page.
- If publications exist, strongly prefer queries that can lead to a direct PDF or arXiv PDF.
- If multiple papers exist, bias toward recent or highly cited papers first.
- Prefer direct PDF over publisher landing pages when possible.
- Existing candidate URLs can already be enough; do not search by default if a strong URL in memory should simply be scraped next.
- Avoid LinkedIn and Google Scholar page scraping.
- Do not repeat the same search query or scrape the same URL unless there is a concrete reason.
- If memory already contains high-confidence evidence, choose finish.
- If the best current next step is a PDF or suspected PDF, use readMode="pdf_first_page".
- 다양한 방법을 시도해.

아래는 실제 이메일 발견 확률이 높습니다.
- direct PDF
- arXiv PDF
- personal homepage
- university faculty/profile page
- lab member page
- GitHub blog/homepage
- CV / Resume PDF
- contact/about page
- company page
- generic search result landing page

아래는 실제 이메일 발견 확률이 낮습니다.
- rocketreach, zoominfo, commerce site, 회사 메인 홈페이지(ex. oracle.com)

Return JSON only:
{
  "thinking": string,
  "action": {
    "tool": "search_web" | "scrape_url" | "finish",
    "query": string?,
    "url": string?,
    "readMode": "full" | "pdf_first_page"?,
    "reason": string
  }
}`;

  const userPrompt = `Step: ${args.step}

${buildCandidatePrompt(args.candidate)}

${buildMemoryPrompt({
  actionHistory: args.actionHistory,
  budgetMeta: args.budgetMeta,
  evidence: args.evidence,
  scrapeHistory: args.scrapeHistory,
  searchHistory: args.searchHistory,
  urlPool: args.urlPool,
})}`;

  const raw = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt,
    0.1
  );

  return safeParseJson(raw) as PlannerDecision | null;
}

function normalizePlannerAction(
  decision: PlannerDecision | null
): PlannerAction | null {
  const tool = decision?.action?.tool;
  const reason = String(
    decision?.action?.reason ?? decision?.thinking ?? ""
  ).trim();

  if (tool !== "search_web" && tool !== "scrape_url" && tool !== "finish") {
    return null;
  }

  if (tool === "finish") {
    return {
      reason: reason || "더 유망한 다음 액션이 없다고 판단했습니다.",
      tool,
    };
  }

  if (tool === "search_web") {
    const query = String(decision?.action?.query ?? "").trim();
    if (!query) return null;
    return {
      query,
      reason: reason || "추가 링크를 찾기 위한 검색",
      tool,
    };
  }

  const url = canonicalizeUrl(decision?.action?.url);
  if (!url || isBlockedDomain(url)) return null;

  return {
    readMode:
      decision?.action?.readMode === "pdf_first_page"
        ? "pdf_first_page"
        : inferReadMode(url),
    reason: reason || "현재 가장 유망한 링크를 파싱",
    tool,
    url,
  };
}

function buildFallbackAction(args: {
  candidate: AtsCandidateDetail;
  searchHistory: SearchRecord[];
  urlPool: Map<string, UrlMemoryEntry>;
}) {
  const nextUrl = getPendingUrls(args.urlPool)[0];
  if (nextUrl) {
    return {
      readMode: nextUrl.readMode,
      reason: "fallback: 가장 우선순위 높은 미파싱 URL",
      tool: "scrape_url" as const,
      url: nextUrl.url,
    };
  }

  const topPublication = getPrioritizedPublications(args.candidate)[0]
    ?.publication;
  if (topPublication?.title) {
    const query = `"${args.candidate.name ?? ""}" "${topPublication.title}" pdf`;
    if (
      !args.searchHistory.some(
        (item) => normalizeQuery(item.query) === normalizeQuery(query)
      )
    ) {
      return {
        query,
        reason: "fallback: 상위 논문 PDF 검색",
        tool: "search_web" as const,
      };
    }
  }

  return {
    reason: "fallback: 더 시도할 유망한 액션이 없습니다.",
    tool: "finish" as const,
  };
}

function makeActionSummary(action: PlannerAction) {
  if (action.tool === "search_web") {
    return `search_web("${action.query}") | ${action.reason}`;
  }
  if (action.tool === "scrape_url") {
    return `scrape_url("${action.url}", ${action.readMode}) | ${action.reason}`;
  }
  return `finish | ${action.reason}`;
}

function makeFinalResult(args: {
  evidence: AtsEmailDiscoveryEvidence[];
  exhausted: boolean;
  finishReason: string | null;
  trace: AtsEmailDiscoveryTraceItem[];
}) {
  const best = pickBestEvidence(args.evidence, "medium");
  if (best) {
    return {
      bestEmail: best.email,
      confidence: best.confidence,
      evidence: args.evidence.slice(0, 5),
      sourceLabel: best.title ?? "web page",
      sourceType: "web" as const,
      sourceUrl: best.url ?? null,
      status: "found" as const,
      summary: args.exhausted
        ? `탐색 한도 ${ATS_EMAIL_DISCOVERY_OPERATION_LIMIT}회에 도달해 현재까지 가장 신뢰도 높은 공개 이메일을 반환했습니다.`
        : args.finishReason
          ? `탐색 종료: ${args.finishReason}`
          : "현재까지 가장 신뢰도 높은 공개 이메일을 반환했습니다.",
      trace: args.trace,
    };
  }

  return {
    bestEmail: null,
    confidence: "low" as const,
    evidence: args.evidence.slice(0, 5),
    sourceLabel: null,
    sourceType: null,
    sourceUrl: null,
    status: "not_found" as const,
    summary: args.exhausted
      ? `탐색 한도 ${ATS_EMAIL_DISCOVERY_OPERATION_LIMIT}회에 도달해 현재까지 공개적으로 확인 가능한 후보자 이메일을 찾지 못했습니다.`
      : args.finishReason
        ? `탐색 종료: ${args.finishReason}`
        : "공개적으로 확인 가능한 후보자 이메일을 찾지 못했습니다.",
    trace: args.trace,
  };
}

export async function findCandidateEmailWithAgenticFlow(args: {
  candidate: AtsCandidateDetail;
  onTrace?: EmailDiscoveryTraceListener | null;
  req: NextRequest;
}): Promise<EmailFinderResult> {
  const trace: AtsEmailDiscoveryTraceItem[] = [];
  const budget = makeBudgetController(trace, args.onTrace);
  const pushTrace = (
    kind: AtsEmailDiscoveryTraceItem["kind"],
    content: string,
    meta?: Record<string, unknown> | null
  ) => addTrace(trace, kind, content, meta, args.onTrace);

  try {
    const directEmail =
      args.candidate.existingEmailSources.find(
        (item) => item.sourceType === "candid" && isValidEmail(item.email)
      ) ??
      args.candidate.existingEmailSources.find(
        (item) => item.sourceType === "github" && isValidEmail(item.email)
      ) ??
      args.candidate.existingEmailSources.find(
        (item) => item.sourceType === "scholar" && isValidEmail(item.email)
      );

    if (directEmail?.email) {
      pushTrace("decision", "기존 저장 이메일을 즉시 사용했습니다.", {
        email: directEmail.email,
        sourceType: directEmail.sourceType,
      });

      return {
        bestEmail: normalizeEmail(directEmail.email),
        confidence: "high",
        evidence: [
          {
            confidence: "high",
            email: normalizeEmail(directEmail.email),
            snippet: "existingEmailSources 에 저장된 이메일",
            title: `existingEmailSources.${directEmail.sourceType}`,
            type: "direct",
            url: null,
          },
        ],
        sourceLabel: `existingEmailSources.${directEmail.sourceType}`,
        sourceType:
          directEmail.sourceType === "candid" ||
          directEmail.sourceType === "github" ||
          directEmail.sourceType === "scholar"
            ? directEmail.sourceType
            : null,
        sourceUrl: null,
        status: "found",
        summary: "기존 저장 이메일을 사용했습니다.",
        trace,
      };
    }

    const searchHistory: SearchRecord[] = [];
    const scrapeHistory: ScrapeRecord[] = [];
    const actionHistory: string[] = [];
    let collectedEvidence: AtsEmailDiscoveryEvidence[] = [];
    let finishReason: string | null = null;

    const urlPool = new Map<string, UrlMemoryEntry>();
    upsertUrlPool(urlPool, collectSeedUrlCandidates(args.candidate));

    pushTrace("decision", "초기 URL 메모리를 구성했습니다.", {
      urls: getPendingUrls(urlPool).map((item) => ({
        priorityHint: item.priorityHint,
        readMode: item.readMode,
        reason: item.priorityReason,
        source: item.source,
        url: item.url,
      })),
    });

    for (let step = 1; step <= ATS_EMAIL_DISCOVERY_OPERATION_LIMIT; step += 1) {
      if (!budget.consume("llm", { stage: "planner", step })) {
        break;
      }

      const plannerDecision = await planNextAction({
        actionHistory,
        budgetMeta: budget.meta(),
        candidate: args.candidate,
        evidence: collectedEvidence,
        scrapeHistory,
        searchHistory,
        step,
        urlPool,
      });

      const action =
        normalizePlannerAction(plannerDecision) ??
        buildFallbackAction({
          candidate: args.candidate,
          searchHistory,
          urlPool,
        });

      actionHistory.push(`${step}. ${makeActionSummary(action)}`);
      pushTrace("decision", `planner action selected: ${action.tool}`, {
        action,
        thinking: plannerDecision?.thinking ?? null,
      });

      if (action.tool === "finish") {
        finishReason = action.reason;
        break;
      }

      if (action.tool === "search_web") {
        const normalizedQuery = normalizeQuery(action.query);
        const query = action.query ?? "";
        if (!normalizedQuery) {
          finishReason = "빈 검색어가 선택되어 탐색을 종료했습니다.";
          break;
        }

        if (
          searchHistory.some(
            (item) => normalizeQuery(item.query) === normalizedQuery
          )
        ) {
          pushTrace("decision", "이미 실행한 검색어라 건너뜁니다.", {
            query: action.query,
          });
          continue;
        }

        if (!budget.consume("search", { query, stage: "web_search" })) {
          break;
        }

        pushTrace("query", query, {
          reason: action.reason,
        });

        let results: SearchResult[] = [];
        try {
          results = await callWebSearch(args.req, query);
        } catch (error) {
          pushTrace("search_result", "검색 중 오류가 발생했습니다.", {
            error: error instanceof Error ? error.message : "unknown",
            query,
          });
        }

        searchHistory.push({
          query,
          results,
        });

        pushTrace("search_result", `검색 결과 ${results.length}건`, {
          query,
          results: results.map((result) => ({
            title: result.title ?? "",
            url: result.url,
          })),
        });

        const searchEvidence = buildSearchSnippetEvidence(results);
        if (searchEvidence.length > 0) {
          collectedEvidence = mergeEvidence(collectedEvidence, searchEvidence);
        }

        upsertUrlPool(
          urlPool,
          buildCandidatesFromSearchResults({
            candidate: args.candidate,
            query,
            results,
          })
        );

        continue;
      }

      const url = canonicalizeUrl(action.url);
      if (!url || isBlockedDomain(url)) {
        pushTrace("decision", "유효하지 않은 URL이라 scrape를 건너뜁니다.", {
          url: action.url ?? null,
        });
        continue;
      }

      const current = urlPool.get(url);
      if (current?.status === "scraped") {
        pushTrace("decision", "이미 파싱한 URL이라 건너뜁니다.", {
          url,
        });
        continue;
      }

      if (!current) {
        upsertUrlPool(urlPool, [
          {
            discoveredFrom: "planner_direct_scrape",
            label: url,
            priorityHint: 40,
            priorityReason: "planner가 직접 지정한 URL",
            readMode: action.readMode ?? inferReadMode(url),
            source: "search_result",
            url,
          },
        ]);
      }

      if (!budget.consume("search", { stage: "scrape", url })) {
        break;
      }

      pushTrace("scrape", `페이지 읽기 시작: ${url}`, {
        readMode: action.readMode,
        reason: action.reason,
      });

      const scraped = await callScrape(args.req, {
        readMode: action.readMode ?? inferReadMode(url),
        url,
      });

      const poolEntry = urlPool.get(url);
      if (poolEntry) {
        poolEntry.attempts += 1;
      }

      if (!scraped?.markdown?.trim()) {
        if (poolEntry) {
          poolEntry.status = "failed";
        }

        scrapeHistory.push({
          discoveredUrls: [],
          error: scraped?.error ?? "empty scrape payload",
          findings: [],
          readMode: action.readMode ?? inferReadMode(url),
          status: "failed",
          title: scraped?.title ?? null,
          url,
        });

        pushTrace("scrape", `페이지 읽기 실패 또는 빈 내용: ${url}`, {
          error: scraped?.error ?? "empty scrape payload",
          status: scraped?.status ?? null,
        });
        continue;
      }

      pushTrace("scrape", `페이지 읽기 완료: ${url}`, {
        contentLength: scraped.markdown.length,
        title: scraped.title ?? "",
      });

      const discoveredLinks = extractLinkedUrlsFromMarkdown(scraped.markdown);
      const discoveredCandidates = buildCandidatesFromDiscoveredLinks({
        candidate: args.candidate,
        links: discoveredLinks,
        parentUrl: url,
      });

      if (discoveredCandidates.length > 0) {
        upsertUrlPool(urlPool, discoveredCandidates);
      }

      if (!budget.consume("llm", { stage: "extract_emails", url })) {
        break;
      }

      const findings = await extractEmailsFromPageWithLlm({
        candidate: args.candidate,
        markdown: scraped.markdown,
        pageTitle: scraped.title ?? null,
        pageUrl: url,
        readMode: action.readMode ?? inferReadMode(url),
      });

      const evidence = findings.map((finding) =>
        evidenceFromFinding({
          finding,
          readMode: action.readMode ?? inferReadMode(url),
          title: scraped.title ?? null,
          url,
        })
      );
      collectedEvidence = mergeEvidence(collectedEvidence, evidence);

      if (poolEntry) {
        poolEntry.lastTitle = scraped.title ?? null;
        poolEntry.status = "scraped";
      }

      scrapeHistory.push({
        discoveredUrls: discoveredCandidates.map((item) => item.url),
        error: null,
        findings,
        readMode: action.readMode ?? inferReadMode(url),
        status: findings.length > 0 ? "found_email" : "no_email",
        title: scraped.title ?? null,
        url,
      });

      pushTrace(
        "decision",
        `페이지에서 이메일 후보 ${findings.length}건 추출`,
        {
          discoveredUrls: discoveredCandidates
            .slice(0, 8)
            .map((item) => item.url),
          findings,
          url,
        }
      );

      const highConfidence = evidence.find(
        (item) => item.confidence === "high"
      );
      if (highConfidence) {
        pushTrace(
          "decision",
          "high confidence 이메일을 발견하여 즉시 종료합니다.",
          {
            email: highConfidence.email,
            url,
          }
        );

        return {
          bestEmail: highConfidence.email,
          confidence: "high",
          evidence: collectedEvidence.slice(0, 5),
          sourceLabel:
            highConfidence.title ?? scraped.title ?? poolEntry?.label ?? url,
          sourceType: "web",
          sourceUrl: highConfidence.url ?? url,
          status: "found",
          summary: "공개 페이지에서 high confidence 이메일을 발견했습니다.",
          trace,
        };
      }
    }

    return makeFinalResult({
      evidence: collectedEvidence,
      exhausted: budget.isExhausted(),
      finishReason,
      trace,
    });
  } catch (error) {
    pushTrace("decision", "이메일 탐색 중 오류가 발생했습니다.", {
      error: error instanceof Error ? error.message : "unknown",
    });

    return {
      bestEmail: null,
      confidence: "low",
      evidence: [],
      sourceLabel: null,
      sourceType: null,
      sourceUrl: null,
      status: "error",
      summary:
        error instanceof Error
          ? error.message
          : "이메일 탐색 중 오류가 발생했습니다.",
      trace,
    };
  }
}
