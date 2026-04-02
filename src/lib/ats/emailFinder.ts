import type { NextRequest } from "next/server";
import { xaiInference } from "@/lib/llm/llm";
import {
  type AtsCandidateDetail,
  type AtsEmailDiscoveryEvidence,
  type AtsEmailDiscoveryTraceItem,
  type AtsEmailSourceType,
  isValidEmail,
  normalizeEmail,
} from "@/lib/ats/shared";

type SearchResult = {
  content?: string;
  snippet?: string;
  title?: string;
  url: string;
};

type ScrapeResult = {
  markdown?: string;
  title?: string;
  url: string;
};

type EmailHit = AtsEmailDiscoveryEvidence & {
  score: number;
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

const MAX_QUERY_COUNT = 6;
const MAX_RESULTS_PER_QUERY = 4;
const MAX_SCRAPE_COUNT = 8;
const MAX_SECOND_PASS_QUERY_COUNT = 3;

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

function makeInternalUrl(req: NextRequest, path: string) {
  const base = new URL(req.url);
  base.pathname = path;
  base.search = "";
  base.hash = "";
  return base.toString();
}

function normalizeUrl(value: string | null | undefined) {
  const url = String(value ?? "").trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  return `https://${url}`;
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

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function extractEmailsFromText(value: string | null | undefined) {
  const text = String(value ?? "");
  const rawMatches = text.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  );

  return dedupeStrings(rawMatches ?? [])
    .map((email) => normalizeEmail(email))
    .filter((email) => {
      if (!isValidEmail(email)) return false;
      if (email.endsWith("@users.noreply.github.com")) return false;
      const prefix = email.split("@")[0] ?? "";
      return !GENERIC_EMAIL_PREFIXES.has(prefix);
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

function scoreEmailHit(args: {
  candidate: AtsCandidateDetail;
  email: string;
  snippet?: string | null;
  sourceType: AtsEmailDiscoveryEvidence["type"];
  url?: string | null;
}) {
  const email = normalizeEmail(args.email);
  const localPart = email.split("@")[0] ?? "";
  let score = 20;

  if (args.sourceType === "direct") score += 80;
  if (args.sourceType === "pdf") score += 35;
  if (args.sourceType === "page") score += 25;
  if (args.sourceType === "search") score += 10;

  const candidateName = String(args.candidate.name ?? "").toLowerCase();
  const snippet = String(args.snippet ?? "").toLowerCase();
  if (candidateName && snippet.includes(candidateName)) {
    score += 20;
  }

  const nameTokens = candidateName
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);

  if (nameTokens.some((token) => localPart.includes(token))) {
    score += 15;
  }

  const currentCompany = String(args.candidate.currentCompany ?? "").toLowerCase();
  if (currentCompany && snippet.includes(currentCompany)) {
    score += 10;
  }

  const scholarAffiliation = String(
    args.candidate.scholarAffiliation ?? ""
  ).toLowerCase();
  if (scholarAffiliation && snippet.includes(scholarAffiliation)) {
    score += 10;
  }

  const url = canonicalizeUrl(args.url);
  if (url.includes(".pdf")) {
    score += 10;
  }
  if (url.includes("github.com")) {
    score += 5;
  }
  if (url.includes(".edu")) {
    score += 10;
  }

  return score;
}

function addTrace(
  trace: AtsEmailDiscoveryTraceItem[],
  kind: AtsEmailDiscoveryTraceItem["kind"],
  content: string,
  meta?: Record<string, unknown> | null
) {
  trace.push({
    at: new Date().toISOString(),
    content,
    kind,
    meta: meta ?? null,
  });
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
    throw new Error(`web_search failed: ${response.status}`);
  }

  const payload = (await response.json().catch(() => ({}))) as
    | SearchResult[]
    | { results?: SearchResult[] };

  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload.results) ? payload.results : [];
}

async function callScrape(
  req: NextRequest,
  url: string
): Promise<ScrapeResult | null> {
  const internalUrl = makeInternalUrl(req, "/api/tool/scrape");
  const response = await fetch(internalUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => ({}))) as ScrapeResult;
  return payload?.url ? payload : null;
}

function collectSeedUrls(candidate: AtsCandidateDetail) {
  return dedupeStrings([
    ...candidate.publications.map((publication) => publication.link),
    ...candidate.links,
    ...candidate.companyLinks,
    candidate.githubProfile?.githubUrl,
    candidate.githubProfile?.blog,
    candidate.scholarProfile?.homepageLink,
  ]).filter((url) => {
    const normalized = canonicalizeUrl(url).toLowerCase();
    return (
      normalized.length > 0 &&
      !normalized.includes("linkedin.com") &&
      !normalized.includes("scholar.google.")
    );
  });
}

function buildDeterministicQueries(candidate: AtsCandidateDetail) {
  const name = String(candidate.name ?? "").trim();
  const queries = dedupeStrings([
    candidate.scholarProfile?.affiliation
      ? `"${name}" "${candidate.scholarProfile.affiliation}" email`
      : null,
    candidate.currentCompany
      ? `"${name}" "${candidate.currentCompany}" email`
      : null,
    candidate.currentSchool
      ? `"${name}" "${candidate.currentSchool}" email`
      : null,
    candidate.githubUsername
      ? `"${name}" "${candidate.githubUsername}" email`
      : null,
    candidate.publications[0]?.title
      ? `"${name}" "${candidate.publications[0].title}" email`
      : null,
    candidate.publications[0]?.title
      ? `"${name}" "${candidate.publications[0].title}" pdf`
      : null,
    `"${name}" email`,
  ]);

  return queries.slice(0, MAX_QUERY_COUNT);
}

function buildSearchSummary(searchResults: Array<{
  query: string;
  results: SearchResult[];
}>) {
  return searchResults
    .map((entry) => {
      const resultText = entry.results
        .slice(0, MAX_RESULTS_PER_QUERY)
        .map((result, index) => {
          return `${index + 1}. ${result.title ?? "Untitled"} | ${result.url} | ${
            result.content ?? result.snippet ?? ""
          }`;
        })
        .join("\n");
      return `Query: ${entry.query}\n${resultText}`;
    })
    .join("\n\n");
}

async function buildSecondPassQueries(args: {
  candidate: AtsCandidateDetail;
  searchSummary: string;
}) {
  const name = String(args.candidate.name ?? "").trim();
  if (!name || !args.searchSummary.trim()) return [] as string[];

  const systemPrompt = `You help a recruiter find a candidate's public email address.
Return JSON only with key "queries" as an array of up to ${MAX_SECOND_PASS_QUERY_COUNT} focused Google-like queries.
Prioritize paper PDFs, lab pages, personal blogs, GitHub/blog pages, and university/company profile pages.
Do not suggest LinkedIn scraping.
Only include distinct, high-signal queries.`;

  const userPrompt = `Candidate:
- name: ${args.candidate.name ?? ""}
- headline: ${args.candidate.headline ?? ""}
- current company: ${args.candidate.currentCompany ?? ""}
- current school: ${args.candidate.currentSchool ?? ""}
- github username: ${args.candidate.githubUsername ?? ""}
- scholar affiliation: ${args.candidate.scholarAffiliation ?? ""}
- top publication: ${args.candidate.publications[0]?.title ?? ""}

First-pass search summary:
${args.searchSummary}`;

  const raw = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt,
    0.2
  );
  const parsed = safeParseJson(raw) as { queries?: string[] } | null;

  return dedupeStrings(parsed?.queries ?? []).slice(0, MAX_SECOND_PASS_QUERY_COUNT);
}

async function chooseBestEmail(args: {
  candidate: AtsCandidateDetail;
  hits: EmailHit[];
  traceSummary: string;
}): Promise<{
  confidence: "high" | "medium" | "low";
  evidenceIndexes: number[];
  sourceType: AtsEmailSourceType | null;
  status: "found" | "not_found";
  summary: string;
  targetEmail: string | null;
}> {
  if (args.hits.length === 0) {
    return {
      confidence: "low" as const,
      evidenceIndexes: [] as number[],
      sourceType: null as AtsEmailSourceType | null,
      status: "not_found" as const,
      summary: "검색과 페이지 스크랩을 진행했지만 검증 가능한 공개 이메일을 찾지 못했습니다.",
      targetEmail: null as string | null,
    };
  }

  const systemPrompt = `You validate candidate email evidence for recruiting outreach.
Return JSON only with keys:
- status: "found" or "not_found"
- targetEmail: string or null
- confidence: "high" | "medium" | "low"
- summary: short Korean summary
- sourceType: "web" | null
- evidenceIndexes: array of integer indexes from the provided evidence list

Choose an email only when the evidence clearly ties it to the candidate.
Prefer paper PDFs, academic profile pages, personal websites, and profile/blog pages over generic search snippets.
If the evidence is ambiguous, return not_found.`;

  const userPrompt = `Candidate:
- name: ${args.candidate.name ?? ""}
- headline: ${args.candidate.headline ?? ""}
- current company: ${args.candidate.currentCompany ?? ""}
- current school: ${args.candidate.currentSchool ?? ""}
- scholar affiliation: ${args.candidate.scholarAffiliation ?? ""}

Evidence:
${args.hits
  .map((hit, index) => {
    return `[${index}] score=${hit.score} type=${hit.type} email=${hit.email} url=${
      hit.url ?? ""
    } title=${hit.title ?? ""} snippet=${hit.snippet ?? ""}`;
  })
  .join("\n")}

Trace summary:
${args.traceSummary}`;

  const raw = await xaiInference(
    "grok-4-fast-reasoning",
    systemPrompt,
    userPrompt,
    0.2
  );
  const parsed = safeParseJson(raw) as
    | {
        confidence?: "high" | "medium" | "low";
        evidenceIndexes?: number[];
        sourceType?: AtsEmailSourceType | null;
        status?: "found" | "not_found";
        summary?: string;
        targetEmail?: string | null;
      }
    | null;

  if (!parsed || parsed.status !== "found" || !isValidEmail(parsed.targetEmail)) {
    return {
      confidence: "low" as const,
      evidenceIndexes: [] as number[],
      sourceType: null as AtsEmailSourceType | null,
      status: "not_found" as const,
      summary: "후보자에게 직접 연결되는 공개 이메일 근거가 부족했습니다.",
      targetEmail: null as string | null,
    };
  }

  return {
    confidence:
      parsed.confidence === "high" || parsed.confidence === "medium"
        ? parsed.confidence
        : "low",
    evidenceIndexes: Array.isArray(parsed.evidenceIndexes)
      ? parsed.evidenceIndexes.filter((index) => Number.isInteger(index))
      : [],
    sourceType: parsed.sourceType === "web" ? "web" : "web",
    status: "found" as const,
    summary:
      String(parsed.summary ?? "").trim() ||
      "검색 및 스크랩 근거를 바탕으로 공개 이메일을 찾았습니다.",
    targetEmail: normalizeEmail(parsed.targetEmail),
  };
}

function pickScrapeTargets(args: {
  additionalUrls: string[];
  searchResults: Array<{ query: string; results: SearchResult[] }>;
}) {
  const prioritized = dedupeStrings([
    ...args.additionalUrls,
    ...args.searchResults.flatMap((entry) =>
      entry.results
        .filter((result) => {
          const lower = canonicalizeUrl(result.url).toLowerCase();
          return (
            lower.endsWith(".pdf") ||
            lower.includes("github.com") ||
            lower.includes(".edu") ||
            lower.includes("/people/") ||
            lower.includes("/team/") ||
            lower.includes("/about")
          );
        })
        .map((result) => result.url)
    ),
    ...args.searchResults.flatMap((entry) =>
      entry.results.slice(0, 2).map((result) => result.url)
    ),
  ]);

  return prioritized
    .map((url) => canonicalizeUrl(url))
    .filter(Boolean)
    .slice(0, MAX_SCRAPE_COUNT);
}

function collectDirectEmailHits(candidate: AtsCandidateDetail) {
  const hits: EmailHit[] = [];

  const directSources = [
    {
      email: candidate.existingEmailSources.find(
        (source) => source.sourceType === "candid"
      )?.email,
      label: "candid.email",
      sourceType: "candid" as const,
      url: null,
    },
    {
      email: candidate.existingEmailSources.find(
        (source) => source.sourceType === "github"
      )?.email,
      label: "github_profile.email",
      sourceType: "github" as const,
      url: candidate.githubProfile?.githubUrl ?? candidate.githubProfile?.blog,
    },
    {
      email: candidate.existingEmailSources.find(
        (source) => source.sourceType === "scholar"
      )?.email,
      label: "scholar_profile.email",
      sourceType: "scholar" as const,
      url: candidate.scholarProfile?.scholarUrl ?? candidate.scholarProfile?.homepageLink,
    },
  ];

  for (const source of directSources) {
    if (!isValidEmail(source.email)) continue;
    hits.push({
      confidence: "high",
      email: normalizeEmail(source.email),
      score: 100,
      snippet: `${source.label} 에 저장된 이메일`,
      title: source.label,
      type: "direct",
      url: source.url ?? null,
    });
  }

  return hits;
}

function collectLocalContextHits(candidate: AtsCandidateDetail) {
  const hits: EmailHit[] = [];
  const contexts = [
    {
      confidence: "medium" as const,
      text: candidate.bio,
      title: "candidate.bio",
      url: candidate.links[0] ?? null,
    },
    {
      confidence: "low" as const,
      text: candidate.shortlistMemo,
      title: "shortlist memo",
      url: null,
    },
    {
      confidence: "medium" as const,
      text: candidate.githubProfile?.bio,
      title: "github_profile.bio",
      url: candidate.githubProfile?.githubUrl ?? candidate.githubProfile?.blog ?? null,
    },
    {
      confidence: "high" as const,
      text: candidate.githubProfile?.readmeMarkdown,
      title: "github_profile.readme_markdown",
      url: candidate.githubProfile?.githubUrl ?? null,
    },
    ...candidate.experience.map((item, index) => ({
      confidence: "low" as const,
      text: item.description,
      title: `experience.description.${index + 1}`,
      url: item.companyLinkedinUrl ?? null,
    })),
  ];

  for (const context of contexts) {
    const text = String(context.text ?? "").trim();
    if (!text) continue;

    for (const email of extractEmailsFromText(text)) {
      hits.push({
        confidence: context.confidence,
        email,
        score: scoreEmailHit({
          candidate,
          email,
          snippet: text,
          sourceType: "page",
          url: context.url,
        }),
        snippet: buildSnippetAroundEmail(text, email) ?? text.slice(0, 240),
        title: context.title,
        type: "page",
        url: context.url,
      });
    }
  }

  return hits;
}

export async function findCandidateEmailWithAgenticFlow(args: {
  candidate: AtsCandidateDetail;
  req: NextRequest;
}): Promise<EmailFinderResult> {
  const trace: AtsEmailDiscoveryTraceItem[] = [];
  const hits: EmailHit[] = collectDirectEmailHits(args.candidate);

  if (hits.length > 0) {
    const best = hits[0];
    addTrace(trace, "decision", "기존 프로필 저장 이메일을 우선 채택했습니다.", {
      email: best.email,
      sourceType: best.type,
    });

    return {
      bestEmail: best.email,
      confidence: "high",
      evidence: hits.map(({ score, ...rest }) => rest),
      sourceLabel: best.title ?? null,
      sourceType:
        best.title === "candid.email"
          ? "candid"
          : best.title === "github_profile.email"
            ? "github"
            : "scholar",
      sourceUrl: best.url ?? null,
      status: "found",
      summary: `${best.title} 에 이미 저장된 이메일을 사용합니다.`,
      trace,
    };
  }

  try {
    const localContextHits = collectLocalContextHits(args.candidate);
    if (localContextHits.length > 0) {
      hits.push(...localContextHits);
      addTrace(trace, "scrape", "저장된 프로필 텍스트에서도 이메일 패턴을 확인했습니다.", {
        hits: localContextHits.map((hit) => ({
          email: hit.email,
          title: hit.title ?? "",
          url: hit.url ?? "",
        })),
      });
    }

    const seedUrls = collectSeedUrls(args.candidate);
    if (seedUrls.length > 0) {
      addTrace(trace, "scrape", "후보자 기본 링크를 먼저 스캔합니다.", {
        urls: seedUrls,
      });
    }

    const deterministicQueries = buildDeterministicQueries(args.candidate);
    const firstPassSearches: Array<{ query: string; results: SearchResult[] }> = [];

    for (const query of deterministicQueries) {
      addTrace(trace, "query", query);
      const results = (await callWebSearch(args.req, query)).slice(
        0,
        MAX_RESULTS_PER_QUERY
      );
      firstPassSearches.push({ query, results });
      addTrace(trace, "search_result", `검색 결과 ${results.length}건`, {
        query,
        results: results.map((result) => ({
          title: result.title ?? "",
          url: result.url,
        })),
      });

      for (const result of results) {
        for (const email of extractEmailsFromText(
          `${result.title ?? ""}\n${result.content ?? result.snippet ?? ""}`
        )) {
          hits.push({
            confidence: "low",
            email,
            score: scoreEmailHit({
              candidate: args.candidate,
              email,
              snippet: `${result.title ?? ""} ${result.content ?? result.snippet ?? ""}`,
              sourceType: "search",
              url: result.url,
            }),
            snippet:
              buildSnippetAroundEmail(
                `${result.title ?? ""} ${result.content ?? result.snippet ?? ""}`,
                email
              ) ?? result.content ?? result.snippet ?? null,
            title: result.title ?? null,
            type: "search",
            url: result.url,
          });
        }
      }
    }

    const secondPassQueries =
      hits.length === 0
        ? await buildSecondPassQueries({
            candidate: args.candidate,
            searchSummary: buildSearchSummary(firstPassSearches),
          })
        : [];

    const secondPassSearches: Array<{ query: string; results: SearchResult[] }> = [];
    for (const query of secondPassQueries) {
      addTrace(trace, "query", `2차 검색: ${query}`);
      const results = (await callWebSearch(args.req, query)).slice(
        0,
        MAX_RESULTS_PER_QUERY
      );
      secondPassSearches.push({ query, results });
      addTrace(trace, "search_result", `2차 검색 결과 ${results.length}건`, {
        query,
        results: results.map((result) => ({
          title: result.title ?? "",
          url: result.url,
        })),
      });
    }

    const scrapeTargets = pickScrapeTargets({
      additionalUrls: seedUrls,
      searchResults: [...firstPassSearches, ...secondPassSearches],
    });

    for (const url of scrapeTargets) {
      const scraped = await callScrape(args.req, url);
      if (!scraped?.markdown) continue;

      addTrace(trace, "scrape", `페이지 스크랩: ${url}`, {
        title: scraped.title ?? "",
      });

      const sourceType = url.toLowerCase().includes(".pdf") ? "pdf" : "page";
      const emails = extractEmailsFromText(scraped.markdown);
      for (const email of emails) {
        hits.push({
          confidence: sourceType === "pdf" ? "high" : "medium",
          email,
          score: scoreEmailHit({
            candidate: args.candidate,
            email,
            snippet: scraped.markdown,
            sourceType,
            url,
          }),
          snippet: buildSnippetAroundEmail(scraped.markdown, email),
          title: scraped.title ?? null,
          type: sourceType,
          url,
        });
      }
    }

    const dedupedHits = Array.from(
      new Map(
        hits
          .sort((a, b) => b.score - a.score)
          .map((hit) => [
            `${hit.email}::${hit.url ?? ""}::${hit.type}`,
            hit,
          ] as const)
      ).values()
    );

    const decision = await chooseBestEmail({
      candidate: args.candidate,
      hits: dedupedHits,
      traceSummary: trace.map((item) => `${item.kind}: ${item.content}`).join("\n"),
    });

    addTrace(
      trace,
      "decision",
      decision.summary,
      decision.targetEmail
        ? {
            email: decision.targetEmail,
            evidenceIndexes: decision.evidenceIndexes,
          }
        : null
    );

    const selectedEvidence =
      decision.evidenceIndexes.length > 0
        ? decision.evidenceIndexes
            .map((index) => dedupedHits[index])
            .filter(Boolean)
            .map(({ score, ...rest }) => rest)
        : dedupedHits.slice(0, 5).map(({ score, ...rest }) => rest);

    if (decision.status !== "found" || !decision.targetEmail) {
      return {
        bestEmail: null,
        confidence: "low",
        evidence: selectedEvidence,
        sourceLabel: null,
        sourceType: null,
        sourceUrl: null,
        status: "not_found",
        summary: decision.summary,
        trace,
      };
    }

    const bestHit =
      dedupedHits.find((hit) => hit.email === decision.targetEmail) ?? null;

    return {
      bestEmail: decision.targetEmail,
      confidence: decision.confidence,
      evidence: selectedEvidence,
      sourceLabel: bestHit?.title ?? "web search",
      sourceType: "web",
      sourceUrl: bestHit?.url ?? null,
      status: "found",
      summary: decision.summary,
      trace,
    };
  } catch (error) {
    addTrace(trace, "decision", "이메일 탐색 중 오류가 발생했습니다.", {
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
