/**
 * Public job APIs of applicant tracking systems whose posting pages are drawn in
 * the browser. A page reader sees only an empty shell or a redirect there, so a
 * closed posting looked like an unreadable page.
 */

const TIMEOUT_MS = 8_000;
const HEADERS = { Accept: "application/json", "User-Agent": "HarperJobPostingReader/1.0" };

/** The employer's own job site says the posting is no longer open. */
export class JobPostingGoneError extends Error {
  readonly recovery = "The posting is closed or removed on the employer's job site. Other openings at the same employer can still be searched.";
  constructor(readonly url: string, readonly detail: string) {
    super(`The employer's job site reports this posting is no longer open: ${detail}`);
    this.name = "JobPostingGoneError";
  }
}

export type AtsPosting = {
  provider: "workday" | "workable";
  title: string;
  companyName: string | null;
  descriptionHtml: string;
  location: string | null;
  postedAt: string | null;
  workMode: "hybrid" | "onsite" | "remote" | null;
  url: string;
};

type Json = Record<string, any>;
async function getJson(fetcher: typeof fetch, url: string, init: RequestInit = {}) {
  const response = await fetcher(url, { ...init, headers: { ...HEADERS, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(TIMEOUT_MS) });
  let body: Json | null = null;
  try { body = await response.json(); } catch { body = null; }
  return { status: response.status, body };
}
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Reads a Workday or Workable posting; null when the URL is neither or the answer is inconclusive. */
export async function readAtsPosting(rawUrl: string, fetcher: typeof fetch = fetch): Promise<AtsPosting | null> {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  if (host.endsWith(".myworkdayjobs.com")) return readWorkday(url, fetcher);
  if (host === "apply.workable.com") return readWorkable(url, fetcher);
  return null;
}

async function readWorkday(url: URL, fetcher: typeof fetch): Promise<AtsPosting | null> {
  const segments = url.pathname.split("/").filter(Boolean);
  const jobIndex = segments.findIndex(segment => segment.toLowerCase() === "job");
  if (jobIndex < 1 || jobIndex === segments.length - 1) return null;
  const site = segments[jobIndex - 1];
  const base = `${url.origin}/wday/cxs/${url.hostname.split(".")[0]}/${site}`;
  const job = await getJson(fetcher, `${base}/${segments.slice(jobIndex).join("/")}`);
  const info = job.body?.jobPostingInfo;
  if (job.status === 200 && text(info?.title)) {
    if (info.posted === false || info.canApply === false)
      throw new JobPostingGoneError(url.toString(), "Workday shows the posting but no longer accepts applications.");
    return {
      provider: "workday", title: text(info.title)!, companyName: text(job.body?.hiringOrganization?.name),
      descriptionHtml: String(info.jobDescription ?? ""), location: text(info.location),
      postedAt: text(info.startDate), workMode: null, url: text(info.externalUrl) ?? url.toString(),
    };
  }
  if (job.status === 404 || job.status === 410)
    throw new JobPostingGoneError(url.toString(), `Workday returned HTTP ${job.status} for the posting.`);
  // Workday also refuses (403) postings it no longer publishes. Confirm with the site's own search.
  const last = segments.at(-1) ?? "";
  const requisition = last.includes("_") ? last.slice(last.lastIndexOf("_") + 1).replace(/-\d+$/, "") : "";
  if (job.status === 403 && requisition) {
    const search = await getJson(fetcher, `${base}/jobs`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: requisition }) });
    if (search.status === 200 && search.body?.total === 0)
      throw new JobPostingGoneError(url.toString(), `Workday no longer lists requisition ${requisition} on the ${site} job site.`);
  }
  return null;
}

async function readWorkable(url: URL, fetcher: typeof fetch): Promise<AtsPosting | null> {
  const segments = url.pathname.split("/").filter(Boolean);
  const j = segments.indexOf("j");
  const shortcode = j >= 0 ? segments[j + 1] : undefined;
  if (!shortcode) return null;
  let account = j === 1 ? segments[0] : null;
  if (!account) {
    // A /j/<code> link redirects to the employer's page when open and to an error page when not.
    const page = await fetcher(url.toString(), { headers: { "User-Agent": HEADERS["User-Agent"], Accept: "text/html" },
      redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const final = new URL(page.url || url.toString());
    if (final.pathname.startsWith("/oops") || final.searchParams.has("not_found"))
      throw new JobPostingGoneError(url.toString(), `Workable redirects the posting to ${final.toString()}.`);
    const finalSegments = final.pathname.split("/").filter(Boolean);
    account = finalSegments[1] === "j" ? finalSegments[0] : null;
    if (!account) return null;
  }
  const job = await getJson(fetcher, `https://apply.workable.com/api/v2/accounts/${encodeURIComponent(account)}/jobs/${encodeURIComponent(shortcode)}`);
  if (job.status === 404)
    throw new JobPostingGoneError(url.toString(), "Workable no longer has this job on the employer's careers page.");
  const body = job.body;
  if (job.status !== 200 || !text(body?.title)) return null;
  if (text(body?.state) && body!.state !== "published")
    throw new JobPostingGoneError(url.toString(), `Workable lists the job as ${body!.state}.`);
  const widget = await getJson(fetcher, `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(account)}`).catch(() => null);
  const location = [body!.location?.city, body!.location?.region, body!.location?.country].map(text).filter(Boolean).join(", ") || null;
  const workplace = ({ on_site: "onsite", hybrid: "hybrid", remote: "remote" } as const)[String(body!.workplace) as "on_site"];
  return {
    provider: "workable", title: text(body!.title)!, companyName: text(widget?.body?.name),
    descriptionHtml: [body!.description, body!.requirements && `<h2>Requirements</h2>${body!.requirements}`,
      body!.benefits && `<h2>Benefits</h2>${body!.benefits}`].filter(Boolean).join("\n"),
    location, postedAt: text(body!.published)?.slice(0, 10) ?? null,
    workMode: body!.remote ? "remote" : workplace ?? null,
    url: `https://apply.workable.com/${account}/j/${shortcode}/`,
  };
}
