import { createHmac, timingSafeEqual } from "node:crypto";
import type { HarperSlackBlock } from "@/lib/org/slackChoiceButtons";
import { formatSlackLink } from "@/lib/org/slackMessages";

/**
 * #qa cards with merge / close buttons for pull requests opened by the
 * incident fixer agent. No database or network access here: the server module
 * injects Slack, GitHub, the Slack response_url, and the Vault secrets.
 */

export const FIXER_PR_SLACK_TEAM_ID = "T09ASGLN207";
export const FIXER_PR_SLACK_CHANNEL_ID = "C0BULQ5K5EJ";
export const FIXER_PR_ALLOWED_SLACK_USER_IDS = [
  "U0C8E9KPMSA",
  "U09B4FF7TV0",
] as const;
export const FIXER_PR_GITHUB_OWNER = "matchharper";
export const FIXER_PR_REPOS = {
  harper_beta: {
    afterMerge: "머지하면 dev까지 들어가요. 운영은 다음 릴리스 때 반영돼요.",
    base: "dev",
  },
  harper_worker: {
    afterMerge: "머지하면 main에 들어가요. 서버 반영(재시작)은 따로 해야 해요.",
    base: "main",
  },
} as const;
export const FIXER_PR_BRANCH_PREFIX = "fix/incident-";
export const FIXER_PR_MERGE_ACTION_ID = "harper_fixer_pr_merge";
export const FIXER_PR_CLOSE_ACTION_ID = "harper_fixer_pr_close";
export const FIXER_PR_SLACK_EVENT_TYPE = "harper_fixer_pr";
/** Supabase Vault secret names. */
export const FIXER_PR_GITHUB_TOKEN_SECRET = "fixer_github_token";
export const FIXER_PR_WEBHOOK_SECRET = "fixer_github_webhook_secret";
export const FIXER_PR_SECRETS_TTL_MS = 5 * 60 * 1000;

export const FIXER_PR_NOT_ALLOWED_TEXT =
  "이 버튼은 지정된 두 분만 누를 수 있어요.";
export const FIXER_PR_UNAVAILABLE_TEXT =
  "지금은 GitHub 연결 설정이 없어 버튼이 동작하지 않아요. GitHub에서 처리해 주세요.";

const INCIDENTS_URL = `https://github.com/${FIXER_PR_GITHUB_OWNER}/harper_incidents/issues`;
const CARD_BLOCK_ID = "harper_fixer_pr_card";
/** Marks a card for a merged or closed PR. */
const FINAL_BLOCK_ID = "harper_fixer_pr_final";
const ACTIONS_BLOCK_ID = "harper_fixer_pr_actions";
const CARD_LOOKUP_DAYS = 30;
const CARD_LOOKUP_PAGES = 3;
const TLDR_MAX_LINES = 3;
const TLDR_MAX_CHARS = 500;
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_TIMEOUT_MS = 15_000;

export type FixerPrRepo = keyof typeof FIXER_PR_REPOS;
export type FixerPrButtonAction = "merge" | "close";
export type FixerPrButtonValue = {
  base: string;
  pr: number;
  repo: FixerPrRepo;
  sha: string;
};
export type FixerPrDecision =
  | FixerPrButtonAction
  | "already_merged"
  | "already_closed"
  | "stale_head"
  | "base_changed"
  | "not_eligible";
export type FixerPrIneligibility =
  | "unknown_repo"
  | "fork"
  | "branch_prefix"
  | "wrong_base"
  | "draft";
export type FixerPrSecrets = { githubToken: string; webhookSecret: string };

/** The fields read from a GitHub pull request (webhook payload or REST). */
export type FixerPrPull = {
  base?: { ref?: string | null; repo?: { full_name?: string | null } | null } | null;
  body?: string | null;
  draft?: boolean | null;
  head?: {
    ref?: string | null;
    repo?: { full_name?: string | null } | null;
    sha?: string | null;
  } | null;
  merge_commit_sha?: string | null;
  merged?: boolean | null;
  merged_at?: string | null;
  number: number;
  state?: string | null;
  title?: string | null;
};

export type FixerPrCardMetadata = {
  event_payload: { pr: number; repo: FixerPrRepo; sha: string };
  event_type: typeof FIXER_PR_SLACK_EVENT_TYPE;
};
export type FixerPrCard = {
  blocks: HarperSlackBlock[];
  metadata: FixerPrCardMetadata;
  text: string;
};

const clean = (value: unknown) => String(value ?? "").trim();

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function escapeMrkdwn(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const shortSha = (value: unknown) => clean(value).slice(0, 7);

/** 을/를 after a number read in Korean: #230을, #232를. */
function objectParticle(value: number) {
  return [2, 4, 5, 9].includes(value % 10) ? "를" : "을";
}

export function isFixerPrRepo(value: unknown): value is FixerPrRepo {
  return typeof value === "string" && Object.keys(FIXER_PR_REPOS).includes(value);
}

export function isFixerPrAllowedUser(value: unknown) {
  return (FIXER_PR_ALLOWED_SLACK_USER_IDS as readonly string[]).includes(
    clean(value)
  );
}

export function fixerPrRepoFromFullName(value: unknown): FixerPrRepo | null {
  const [owner, name, ...rest] = clean(value).split("/");
  return !rest.length && owner === FIXER_PR_GITHUB_OWNER && isFixerPrRepo(name)
    ? name
    : null;
}

/** GitHub `x-hub-signature-256`: "sha256=" + HMAC-SHA256 hex of the raw body. */
export function verifyFixerPrWebhookSignature(args: {
  payload: string;
  secret: string;
  signature: string | null | undefined;
}) {
  if (!args.secret) throw new Error(`${FIXER_PR_WEBHOOK_SECRET} is required`);
  const header = clean(args.signature);
  if (!header.startsWith("sha256=")) return false;
  const expected = Buffer.from(
    createHmac("sha256", args.secret).update(args.payload, "utf8").digest("hex")
  );
  const actual = Buffer.from(header.slice("sha256=".length));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Why a PR is not a fixer PR the buttons may act on, or null. Forks are out
 * because the token would merge code from outside the repository.
 */
export function fixerPrIneligibility(args: {
  pull: FixerPrPull;
  repositoryFullName: unknown;
}): FixerPrIneligibility | null {
  const repo = fixerPrRepoFromFullName(args.repositoryFullName);
  if (!repo) return "unknown_repo";
  if (clean(args.pull.head?.repo?.full_name) !== `${FIXER_PR_GITHUB_OWNER}/${repo}`)
    return "fork";
  if (!clean(args.pull.head?.ref).startsWith(FIXER_PR_BRANCH_PREFIX))
    return "branch_prefix";
  if (clean(args.pull.base?.ref) !== FIXER_PR_REPOS[repo].base)
    return "wrong_base";
  if (args.pull.draft === true) return "draft";
  return null;
}

/** Text under the PR body's "## TL;DR" heading: at most 3 lines, 500 characters. */
export function extractFixerPrTldr(body: unknown): string[] {
  const lines = String(body ?? "").replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((line) =>
    /^\s{0,3}#{1,6}\s*TL;?\s*DR\s*:?\s*#*\s*$/i.test(line)
  );
  if (start < 0) return [];
  const end = lines.findIndex(
    (line, index) => index > start && /^\s{0,3}#{1,6}(\s|$)/.test(line)
  );
  const section = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "");
  const result: string[] = [];
  let remaining = TLDR_MAX_CHARS;
  for (const raw of section.split("\n")) {
    const line = raw
      .trim()
      .replace(/^>\s?/, "")
      .replace(/^[-*+]\s+/, "• ")
      .trim();
    if (!line) continue;
    const chars = Array.from(line);
    if (chars.length > remaining) {
      result.push(`${chars.slice(0, Math.max(remaining - 1, 0)).join("")}…`);
      break;
    }
    result.push(line);
    remaining -= chars.length;
    if (result.length === TLDR_MAX_LINES || remaining === 0) break;
  }
  return result;
}

/** From the branch `fix/incident-<N>-...`, else the body line `관련 사건: matchharper/harper_incidents#N`. */
export function parseFixerPrIncidentNumber(args: {
  body?: unknown;
  branch?: unknown;
}): number | null {
  const branch = clean(args.branch);
  const fromBranch = branch.startsWith(FIXER_PR_BRANCH_PREFIX)
    ? /^(\d+)(?:\D|$)/.exec(branch.slice(FIXER_PR_BRANCH_PREFIX.length))?.[1]
    : undefined;
  const fromBody =
    /관련\s*사건\s*[:：]\s*(?:matchharper\/harper_incidents#|https:\/\/github\.com\/matchharper\/harper_incidents\/issues\/)(\d+)/.exec(
      String(args.body ?? "")
    )?.[1];
  const number = Number(fromBranch ?? fromBody);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

/** Times on cards: Asia/Seoul, M/D HH:mm. */
export function formatFixerPrSeoulTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "numeric",
    timeZone: "Asia/Seoul",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("month")}/${part("day")} ${part("hour")}:${part("minute")}`;
}

const MARKDOWN_LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** GitHub markdown in a TL;DR line to Slack mrkdwn (links and bold). */
function markdownLineToMrkdwn(value: string) {
  let result = "";
  let last = 0;
  for (const match of value.matchAll(MARKDOWN_LINK)) {
    const index = match.index ?? 0;
    result +=
      escapeMrkdwn(value.slice(last, index)) +
      formatSlackLink(match[2], match[1]);
    last = index + match[0].length;
  }
  return `${result}${escapeMrkdwn(value.slice(last))}`.replace(
    /\*\*([^*\n]+)\*\*/g,
    "*$1*"
  );
}

const fixerPrUrl = (repo: FixerPrRepo, pr: number) =>
  `https://github.com/${FIXER_PR_GITHUB_OWNER}/${repo}/pull/${pr}`;
const plainText = (text: string) => ({ type: "plain_text", text, emoji: true });
const section = (blockId: string, text: string): HarperSlackBlock => ({
  type: "section",
  block_id: blockId,
  text: { type: "mrkdwn", text },
});

/** `<사건 #44> <title> → <harper_beta #230>`; every card keeps the PR link. */
function pullLine(repo: FixerPrRepo, pull: FixerPrPull) {
  const incident = parseFixerPrIncidentNumber({
    body: pull.body,
    branch: pull.head?.ref,
  });
  return [
    incident ? formatSlackLink(`${INCIDENTS_URL}/${incident}`, `사건 #${incident}`) : "",
    escapeMrkdwn(clean(pull.title) || `PR #${pull.number}`),
    "→",
    formatSlackLink(fixerPrUrl(repo, pull.number), `${repo} #${pull.number}`),
  ]
    .filter(Boolean)
    .join(" ");
}

function fallbackText(label: string, repo: FixerPrRepo, pull: FixerPrPull) {
  return `${label}: ${repo} #${pull.number} ${escapeMrkdwn(clean(pull.title))}`.trim();
}

function cardMetadata(repo: FixerPrRepo, pull: FixerPrPull): FixerPrCardMetadata {
  return {
    event_payload: { pr: pull.number, repo, sha: clean(pull.head?.sha) },
    event_type: FIXER_PR_SLACK_EVENT_TYPE,
  };
}

export function encodeFixerPrButtonValue(value: FixerPrButtonValue) {
  return JSON.stringify({
    repo: value.repo,
    pr: value.pr,
    sha: value.sha,
    base: value.base,
  });
}

/** Button value `{ repo, pr, sha, base }`; anything else is not ours to act on. */
export function parseFixerPrButtonValue(value: unknown): FixerPrButtonValue | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(String(value ?? "")));
  } catch {
    return null;
  }
  const { base, pr, repo, sha } = parsed;
  if (!isFixerPrRepo(repo)) return null;
  if (typeof pr !== "number" || !Number.isSafeInteger(pr) || pr <= 0) return null;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) return null;
  if (base !== FIXER_PR_REPOS[repo].base) return null;
  return { base: FIXER_PR_REPOS[repo].base, pr, repo, sha };
}

function actionsBlock(repo: FixerPrRepo, pull: FixerPrPull): HarperSlackBlock {
  const base = FIXER_PR_REPOS[repo].base;
  const value = encodeFixerPrButtonValue({
    base,
    pr: pull.number,
    repo,
    sha: clean(pull.head?.sha),
  });
  return {
    type: "actions",
    block_id: ACTIONS_BLOCK_ID,
    elements: [
      {
        type: "button",
        action_id: FIXER_PR_MERGE_ACTION_ID,
        style: "primary",
        text: plainText("머지"),
        value,
        confirm: {
          title: plainText("수정 PR 머지"),
          text: plainText(
            `${repo} #${pull.number}${objectParticle(pull.number)} ${base}에 머지할까요?`
          ),
          confirm: plainText("머지"),
          deny: plainText("취소"),
        },
      },
      {
        type: "button",
        action_id: FIXER_PR_CLOSE_ACTION_ID,
        text: plainText("머지 안 함"),
        value,
        confirm: {
          title: plainText("수정 PR 닫기"),
          text: plainText("PR을 닫을까요? 머지하지 않아요."),
          confirm: plainText("닫기"),
          deny: plainText("취소"),
        },
      },
    ],
  };
}

/** The card asking for a decision. `buttons: false` keeps it open but inert. */
export function buildFixerPrOpenCard(args: {
  buttons?: boolean;
  notice?: string | null;
  previousSha?: string | null;
  pull: FixerPrPull;
  repo: FixerPrRepo;
}): FixerPrCard {
  const { pull, repo } = args;
  const config = FIXER_PR_REPOS[repo];
  const sha = clean(pull.head?.sha);
  const previousSha = clean(args.previousSha);
  const lines = [
    "*수정 PR · 머지할지 정해 주세요*",
    pullLine(repo, pull),
    ...extractFixerPrTldr(pull.body).map(
      (line) => `> ${markdownLineToMrkdwn(line)}`
    ),
    ...(previousSha && previousSha !== sha
      ? [`커밋이 바뀌었어요: \`${shortSha(previousSha)}\` → \`${shortSha(sha)}\``]
      : []),
    `대상 \`${config.base}\` · 커밋 \`${shortSha(sha)}\` · ${config.afterMerge}`,
    ...(clean(args.notice) ? [clean(args.notice)] : []),
  ];
  return {
    blocks: [
      section(CARD_BLOCK_ID, lines.join("\n")),
      ...(args.buttons === false ? [] : [actionsBlock(repo, pull)]),
    ],
    metadata: cardMetadata(repo, pull),
    text: fallbackText("수정 PR · 머지할지 정해 주세요", repo, pull),
  };
}

/** Merged or closed, by a button press (`by`) or on GitHub (`by` absent). No buttons. */
export function buildFixerPrFinalCard(args: {
  at?: unknown;
  by?: string | null;
  mergeSha?: string | null;
  outcome: "merged" | "closed";
  pull: FixerPrPull;
  repo: FixerPrRepo;
}): FixerPrCard {
  const { pull, repo } = args;
  const who = clean(args.by) ? `<@${clean(args.by)}>` : "(GitHub에서)";
  const base = clean(pull.base?.ref) || FIXER_PR_REPOS[repo].base;
  const status =
    args.outcome === "merged"
      ? [
          "✅ 머지됨",
          who,
          formatFixerPrSeoulTime(args.at),
          `\`${base}\` 커밋 \`${shortSha(args.mergeSha || pull.merge_commit_sha || pull.head?.sha)}\``,
        ]
          .filter(Boolean)
          .join(" · ")
      : `닫힘 · 머지 안 함 · ${who}`;
  return {
    blocks: [section(FINAL_BLOCK_ID, `${status}\n${pullLine(repo, pull)}`)],
    metadata: cardMetadata(repo, pull),
    text: fallbackText(
      args.outcome === "merged" ? "✅ 머지됨" : "닫힘 · 머지 안 함",
      repo,
      pull
    ),
  };
}

/** The PR now targets another branch: buttons off until it targets the expected one again. */
export function buildFixerPrBaseChangedCard(args: {
  pull: FixerPrPull;
  repo: FixerPrRepo;
}): FixerPrCard {
  const { pull, repo } = args;
  const line = `대상 브랜치가 바뀌었어요: \`${FIXER_PR_REPOS[repo].base}\` → \`${clean(pull.base?.ref)}\` · 버튼을 껐어요. GitHub에서 확인해 주세요.`;
  return {
    blocks: [section(CARD_BLOCK_ID, `${line}\n${pullLine(repo, pull)}`)],
    metadata: cardMetadata(repo, pull),
    text: fallbackText("대상 브랜치가 바뀌어 버튼을 껐어요", repo, pull),
  };
}

/** Draft, fork, or another branch: buttons off. */
export function buildFixerPrDisabledCard(args: {
  pull: FixerPrPull;
  repo: FixerPrRepo;
}): FixerPrCard {
  const { pull, repo } = args;
  const reason =
    pull.draft === true
      ? "초안 상태라 버튼을 껐어요."
      : `수정 에이전트 PR(같은 저장소의 \`${FIXER_PR_BRANCH_PREFIX}\` 브랜치)이 아니라 버튼을 껐어요.`;
  return {
    blocks: [
      section(CARD_BLOCK_ID, `${reason} GitHub에서 확인해 주세요.\n${pullLine(repo, pull)}`),
    ],
    metadata: cardMetadata(repo, pull),
    text: fallbackText("버튼을 껐어요", repo, pull),
  };
}

/** What a press should do, from the PR as GitHub reports it now. */
export function decideFixerPrAction(args: {
  action: FixerPrButtonAction;
  pull: FixerPrPull;
  value: FixerPrButtonValue;
}): FixerPrDecision {
  const { action, pull, value } = args;
  if (pull.merged === true || clean(pull.merged_at)) return "already_merged";
  if (clean(pull.state) !== "open") return "already_closed";
  const problem = fixerPrIneligibility({
    pull,
    repositoryFullName: `${FIXER_PR_GITHUB_OWNER}/${value.repo}`,
  });
  if (problem === "wrong_base") return "base_changed";
  if (problem) return "not_eligible";
  // The person decided on the commit the card showed, for either button.
  if (clean(pull.head?.sha) !== value.sha) return "stale_head";
  return action;
}

export class FixerPrGitHubError extends Error {
  readonly status: number;

  /** `status` 0: no HTTP response (network error or timeout). */
  constructor(status: number, message: string) {
    super(message);
    this.name = "FixerPrGitHubError";
    this.status = status;
  }
}

export type FixerPrGitHub = {
  closePull(repo: FixerPrRepo, pr: number): Promise<FixerPrPull>;
  getPull(repo: FixerPrRepo, pr: number): Promise<FixerPrPull>;
  mergePull(
    repo: FixerPrRepo,
    pr: number,
    sha: string
  ): Promise<{ merged: boolean; sha: string | null }>;
};

export function createFixerPrGitHubClient(args: {
  fetch?: typeof fetch;
  timeoutMs?: number;
  token: string;
}): FixerPrGitHub {
  const fetchImpl = args.fetch ?? fetch;
  async function request(
    method: "GET" | "PATCH" | "PUT",
    path: string,
    body?: Record<string, unknown>
  ) {
    let response: Response;
    try {
      response = await fetchImpl(`${GITHUB_API_URL}${path}`, {
        ...(body ? { body: JSON.stringify(body) } : {}),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${args.token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
          "User-Agent": "harper-fixer-pr-slack",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        method,
        signal: AbortSignal.timeout(args.timeoutMs ?? GITHUB_TIMEOUT_MS),
      });
    } catch (error) {
      throw new FixerPrGitHubError(
        0,
        error instanceof Error ? error.message : String(error)
      );
    }
    const payload = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      throw new FixerPrGitHubError(
        response.status,
        clean(payload.message) || `GitHub ${method} ${response.status}`
      );
    }
    return payload;
  }
  const pullPath = (repo: FixerPrRepo, pr: number) =>
    `/repos/${FIXER_PR_GITHUB_OWNER}/${repo}/pulls/${pr}`;
  return {
    async closePull(repo, pr) {
      return (await request("PATCH", pullPath(repo, pr), {
        state: "closed",
      })) as FixerPrPull;
    },
    async getPull(repo, pr) {
      return (await request("GET", pullPath(repo, pr))) as FixerPrPull;
    },
    async mergePull(repo, pr, sha) {
      const result = await request("PUT", `${pullPath(repo, pr)}/merge`, {
        merge_method: "merge",
        sha,
      });
      return { merged: result.merged === true, sha: clean(result.sha) || null };
    },
  };
}

/** Vault secrets, cached for 5 minutes. Missing or unreadable: null (feature off). */
export function createFixerPrSecretsLoader(args: {
  now?: () => number;
  query: (
    names: string[]
  ) => Promise<Array<{ decrypted_secret?: unknown; name?: unknown }>>;
  ttlMs?: number;
}) {
  let cached: { at: number; secrets: FixerPrSecrets } | null = null;
  return async function loadFixerPrSecrets(): Promise<FixerPrSecrets | null> {
    const now = (args.now ?? Date.now)();
    if (cached && now - cached.at < (args.ttlMs ?? FIXER_PR_SECRETS_TTL_MS))
      return cached.secrets;
    let rows: Array<{ decrypted_secret?: unknown; name?: unknown }>;
    try {
      rows = await args.query([FIXER_PR_GITHUB_TOKEN_SECRET, FIXER_PR_WEBHOOK_SECRET]);
    } catch (error) {
      console.warn(
        "[fixer-pr] Vault secrets unavailable",
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
    const secret = (name: string) =>
      clean(rows.find((row) => row.name === name)?.decrypted_secret);
    const secrets = {
      githubToken: secret(FIXER_PR_GITHUB_TOKEN_SECRET),
      webhookSecret: secret(FIXER_PR_WEBHOOK_SECRET),
    };
    if (!secrets.githubToken || !secrets.webhookSecret) {
      console.warn("[fixer-pr] Vault secret missing", {
        [FIXER_PR_GITHUB_TOKEN_SECRET]: Boolean(secrets.githubToken),
        [FIXER_PR_WEBHOOK_SECRET]: Boolean(secrets.webhookSecret),
      });
      return null;
    }
    cached = { at: now, secrets };
    return secrets;
  };
}

export type FixerPrSlackResponse = {
  messages?: unknown[];
  response_metadata?: { next_cursor?: string };
  ts?: string;
};
/** A Slack Web API call with the Harper bot token (form-encoded body). */
export type FixerPrSlackCall = (
  method: string,
  body: Record<string, unknown>
) => Promise<FixerPrSlackResponse>;

export type FixerPrFoundCard = {
  final: boolean;
  pr: number;
  repo: FixerPrRepo;
  sha: string;
  ts: string;
};

export function readFixerPrCard(message: unknown): FixerPrFoundCard | null {
  const record = asRecord(message);
  const metadata = asRecord(record.metadata);
  if (metadata.event_type !== FIXER_PR_SLACK_EVENT_TYPE) return null;
  const payload = asRecord(metadata.event_payload);
  const repo = clean(payload.repo);
  const pr = Number(payload.pr);
  const ts = clean(record.ts);
  if (!isFixerPrRepo(repo) || !Number.isSafeInteger(pr) || pr <= 0 || !ts)
    return null;
  return {
    final:
      Array.isArray(record.blocks) &&
      record.blocks.some((block) => asRecord(block).block_id === FINAL_BLOCK_ID),
    pr,
    repo,
    sha: clean(payload.sha),
    ts,
  };
}

/** Newest card for this PR in the last 30 days of the channel, at most 3 pages. */
export async function findFixerPrCard(args: {
  now: Date;
  pr: number;
  repo: FixerPrRepo;
  slack: FixerPrSlackCall;
}) {
  const oldest = String(
    Math.floor(args.now.getTime() / 1000) - CARD_LOOKUP_DAYS * 24 * 60 * 60
  );
  let cursor = "";
  for (let page = 0; page < CARD_LOOKUP_PAGES; page += 1) {
    const result = await args.slack("conversations.history", {
      channel: FIXER_PR_SLACK_CHANNEL_ID,
      ...(cursor ? { cursor } : {}),
      include_all_metadata: true,
      limit: 200,
      oldest,
    });
    for (const message of result.messages ?? []) {
      const card = readFixerPrCard(message);
      if (card?.repo === args.repo && card.pr === args.pr) return card;
    }
    cursor = clean(result.response_metadata?.next_cursor);
    if (!cursor) break;
  }
  return null;
}

function cardBody(card: FixerPrCard) {
  return {
    blocks: JSON.stringify(card.blocks),
    channel: FIXER_PR_SLACK_CHANNEL_ID,
    metadata: JSON.stringify(card.metadata),
    text: card.text,
  };
}

export type FixerPrWebhookPlan =
  | { kind: "ignore"; reason: string }
  | {
      kind: "open";
      postIfMissing: boolean;
      pull: FixerPrPull;
      repo: FixerPrRepo;
      /** Only a reopened PR brings a merged/closed card back. */
      reviveFinal: boolean;
    }
  | { kind: "base_changed" | "final"; pull: FixerPrPull; repo: FixerPrRepo };

/** Which card a `pull_request` delivery should leave in the channel. */
export function planFixerPrWebhook(payload: unknown): FixerPrWebhookPlan {
  const record = asRecord(payload);
  const pull = asRecord(record.pull_request) as unknown as FixerPrPull;
  const ignore = (reason: string): FixerPrWebhookPlan => ({ kind: "ignore", reason });
  if (!Number.isSafeInteger(pull.number) || pull.number <= 0)
    return ignore("invalid_payload");
  const repositoryFullName = asRecord(record.repository).full_name;
  const repo = fixerPrRepoFromFullName(repositoryFullName);
  const problem = fixerPrIneligibility({ pull, repositoryFullName });
  if (!repo || problem === "unknown_repo" || problem === "fork" || problem === "branch_prefix")
    return ignore(problem ?? "unknown_repo");
  const action = clean(record.action);
  const open = clean(pull.state) === "open";
  switch (action) {
    case "opened":
    case "reopened":
    case "ready_for_review":
    case "synchronize":
      if (!open) return ignore("not_open");
      if (problem) return ignore(problem);
      return { kind: "open", postIfMissing: true, pull, repo, reviveFinal: action === "reopened" };
    case "edited": {
      if (!open) return ignore("not_open");
      const baseChanged = "base" in asRecord(record.changes);
      if (problem === "wrong_base")
        return baseChanged ? { kind: "base_changed", pull, repo } : ignore(problem);
      if (problem) return ignore(problem);
      // A base changed back to the expected branch posts; a title/body edit only refreshes.
      return { kind: "open", postIfMissing: baseChanged, pull, repo, reviveFinal: false };
    }
    case "closed":
      return { kind: "final", pull, repo };
    default:
      return ignore(`action_${action || "missing"}`);
  }
}

export type FixerPrWebhookInput = {
  event: string | null;
  rawBody: string;
  signature: string | null;
};
export type FixerPrWebhookDeps = {
  loadSecrets: () => Promise<FixerPrSecrets | null>;
  now?: () => Date;
  slack: FixerPrSlackCall;
};
export type FixerPrWebhookResult = {
  body: Record<string, unknown>;
  status: number;
};

async function applyFixerPrWebhookPlan(
  plan: Exclude<FixerPrWebhookPlan, { kind: "ignore" }>,
  deps: FixerPrWebhookDeps
): Promise<Record<string, unknown>> {
  const card = await findFixerPrCard({
    now: deps.now?.() ?? new Date(),
    pr: plan.pull.number,
    repo: plan.repo,
    slack: deps.slack,
  });
  if (plan.kind === "open") {
    if (card?.final && !plan.reviveFinal) return { reason: "final_card", result: "skipped" };
    const next = buildFixerPrOpenCard({ previousSha: card?.sha, pull: plan.pull, repo: plan.repo });
    if (card) {
      await deps.slack("chat.update", { ...cardBody(next), ts: card.ts });
      return { result: "updated", ts: card.ts };
    }
    if (!plan.postIfMissing) return { reason: "no_card", result: "skipped" };
    const posted = await deps.slack("chat.postMessage", {
      ...cardBody(next),
      unfurl_links: false,
      unfurl_media: false,
    });
    return { result: "posted", ts: clean(posted.ts) || null };
  }
  if (!card) return { reason: "no_card", result: "skipped" };
  // A press already wrote the final card, with who pressed; keep it.
  if (card.final) return { reason: "final_card", result: "skipped" };
  const next =
    plan.kind === "base_changed"
      ? buildFixerPrBaseChangedCard(plan)
      : buildFixerPrFinalCard({
          at: plan.pull.merged_at,
          outcome: plan.pull.merged === true ? "merged" : "closed",
          pull: plan.pull,
          repo: plan.repo,
        });
  await deps.slack("chat.update", { ...cardBody(next), ts: card.ts });
  return { result: "updated", ts: card.ts };
}

/**
 * GitHub `pull_request` webhook. Works inline so GitHub records a failed
 * delivery (500) when Slack did not take the card; a redelivery updates it.
 */
export async function runFixerPrWebhook(
  input: FixerPrWebhookInput,
  deps: FixerPrWebhookDeps
): Promise<FixerPrWebhookResult> {
  const secrets = await deps.loadSecrets();
  if (!secrets) return { body: { error: "fixer_pr_unavailable" }, status: 503 };
  const verified = verifyFixerPrWebhookSignature({
    payload: input.rawBody,
    secret: secrets.webhookSecret,
    signature: input.signature,
  });
  if (!verified) return { body: { error: "invalid_signature" }, status: 401 };
  const event = clean(input.event);
  if (event === "ping") return { body: { ok: true, status: "pong" }, status: 200 };
  if (event !== "pull_request")
    return { body: { event, ignored: true, ok: true }, status: 200 };
  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { body: { error: "invalid_json" }, status: 400 };
  }
  const action = clean(asRecord(payload).action);
  const plan = planFixerPrWebhook(payload);
  if (plan.kind === "ignore")
    return { body: { action, ignored: true, ok: true, reason: plan.reason }, status: 200 };
  const summary = { action, pr: plan.pull.number, repo: plan.repo };
  try {
    const result = await applyFixerPrWebhookPlan(plan, deps);
    return { body: { ok: true, ...summary, ...result }, status: 200 };
  } catch (error) {
    console.error("[fixer-pr/webhook] Slack card not written", {
      ...summary,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      body: {
        error: "slack_failed",
        ok: false,
        ...summary,
        code: clean((error as { code?: unknown } | null)?.code) || null,
      },
      status: 500,
    };
  }
}

export type FixerPrSlackActionPayload = {
  actions?: Array<{ action_id?: string; value?: string }>;
  channel?: { id?: string };
  container?: { channel_id?: string };
  response_url?: string;
  team?: { id?: string };
  type?: string;
  user?: { id?: string };
};
export type FixerPrClickDeps = {
  github: (token: string) => FixerPrGitHub;
  loadSecrets: () => Promise<FixerPrSecrets | null>;
  now?: () => Date;
  /** POST a message JSON to the interaction's Slack response_url. */
  respond: (responseUrl: string, body: Record<string, unknown>) => Promise<void>;
  /** Work after Slack has its acknowledgement (`after` on the server). */
  schedule: (task: () => Promise<void>) => void;
};

const ephemeral = (text: string) => ({
  replace_original: false,
  response_type: "ephemeral",
  text,
});
function cardForDecision(
  decision: Exclude<FixerPrDecision, FixerPrButtonAction>,
  pull: FixerPrPull,
  value: FixerPrButtonValue
): FixerPrCard {
  const repo = value.repo;
  switch (decision) {
    case "already_merged":
      return buildFixerPrFinalCard({ at: pull.merged_at, outcome: "merged", pull, repo });
    case "already_closed":
      return buildFixerPrFinalCard({ outcome: "closed", pull, repo });
    case "base_changed":
      return buildFixerPrBaseChangedCard({ pull, repo });
    case "not_eligible":
      return buildFixerPrDisabledCard({ pull, repo });
    case "stale_head":
      return buildFixerPrOpenCard({
        notice: "버튼을 새 커밋 기준으로 바꿨어요. 확인하고 다시 눌러 주세요.",
        previousSha: value.sha,
        pull,
        repo,
      });
  }
}

/** GitHub refused: say why, keeping the buttons only where a later press can succeed. */
function refusalNotice(error: unknown) {
  const status = error instanceof FixerPrGitHubError ? error.status : 0;
  const detail = escapeMrkdwn(
    clean(error instanceof Error ? error.message : "").slice(0, 160)
  );
  const reason = [status ? `GitHub ${status}` : "", detail].filter(Boolean).join(" · ");
  if (status === 405)
    return {
      buttons: true,
      notice: `⚠️ 지금은 머지할 수 없어요 (${reason}). 충돌이나 필수 검사가 풀리면 다시 눌러 주세요.`,
    };
  if ([401, 403, 404, 422].includes(status))
    return {
      buttons: false,
      notice: `⚠️ GitHub이 거절했어요 (${reason}). GitHub에서 확인해 주세요.`,
    };
  return {
    buttons: true,
    notice: `⚠️ GitHub 응답을 받지 못했어요${status ? ` (GitHub ${status})` : ""}. 잠시 후 다시 눌러 주세요.`,
  };
}

/** Merge or close on GitHub; the card to show for what actually happened. */
async function applyFixerPrPress(args: {
  action: FixerPrButtonAction;
  github: FixerPrGitHub;
  now: () => Date;
  pull: FixerPrPull;
  userId: string;
  value: FixerPrButtonValue;
}): Promise<FixerPrCard> {
  const { action, github, pull, userId, value } = args;
  try {
    if (action === "merge") {
      const merged = await github.mergePull(value.repo, value.pr, value.sha);
      if (!merged.merged) throw new FixerPrGitHubError(0, "GitHub did not merge the PR");
      return buildFixerPrFinalCard({
        at: args.now(),
        by: userId,
        mergeSha: merged.sha,
        outcome: "merged",
        pull,
        repo: value.repo,
      });
    }
    const closed = await github.closePull(value.repo, value.pr);
    // Someone merged it in the meantime: closing changed nothing.
    if (closed.merged === true) return cardForDecision("already_merged", closed, value);
    return buildFixerPrFinalCard({ by: userId, outcome: "closed", pull: closed, repo: value.repo });
  } catch (error) {
    console.warn(`[fixer-pr/click] ${action} refused`, error);
    // Read the PR again so a race (another press, a push, GitHub) shows the real state.
    const latest = await github.getPull(value.repo, value.pr).catch(() => null);
    const latestDecision = latest ? decideFixerPrAction({ action, pull: latest, value }) : action;
    if (latestDecision !== "merge" && latestDecision !== "close")
      return cardForDecision(latestDecision, latest ?? pull, value);
    const { buttons, notice } = refusalNotice(error);
    return buildFixerPrOpenCard({ buttons, notice, pull: latest ?? pull, repo: value.repo });
  }
}

async function runFixerPrClick(args: {
  action: FixerPrButtonAction;
  deps: FixerPrClickDeps;
  responseUrl: string;
  userId: string;
  value: FixerPrButtonValue;
}) {
  const { action, deps, userId, value } = args;
  const respond = (body: Record<string, unknown>) => deps.respond(args.responseUrl, body);
  const replace = async (card: FixerPrCard) => {
    try {
      await respond({ ...card, replace_original: true });
    } catch (error) {
      // Slack documents message metadata for chat.* methods, not for
      // response_url. If Slack refuses it there, the visible card matters more.
      console.warn("[fixer-pr/click] card replacement refused; retrying without metadata", error);
      await respond({ blocks: card.blocks, replace_original: true, text: card.text });
    }
  };
  const secrets = await deps.loadSecrets();
  if (!secrets) return respond(ephemeral(FIXER_PR_UNAVAILABLE_TEXT));
  const github = deps.github(secrets.githubToken);
  let pull: FixerPrPull;
  try {
    pull = await github.getPull(value.repo, value.pr);
  } catch (error) {
    console.warn("[fixer-pr/click] PR not read", error);
    const status = error instanceof FixerPrGitHubError ? error.status : 0;
    return respond(
      ephemeral(
        `GitHub에서 PR을 불러오지 못했어요${status ? ` (GitHub ${status})` : ""}. 잠시 후 다시 눌러 주세요.`
      )
    );
  }
  const decision = decideFixerPrAction({ action, pull, value });
  if (decision !== "merge" && decision !== "close")
    return replace(cardForDecision(decision, pull, value));
  return replace(
    await applyFixerPrPress({
      action: decision,
      github,
      now: deps.now ?? (() => new Date()),
      pull,
      userId,
      value,
    })
  );
}

/**
 * [머지] / [머지 안 함] on a fixer PR card. Returns null for other actions.
 * Only the two allowed people in the #qa channel of the Harper workspace act.
 */
export async function routeFixerPrSlackAction(
  payload: FixerPrSlackActionPayload,
  deps: FixerPrClickDeps
) {
  if (payload.type !== "block_actions") return null;
  const action = payload.actions?.[0];
  const actionId = clean(action?.action_id);
  const kind: FixerPrButtonAction | null =
    actionId === FIXER_PR_MERGE_ACTION_ID
      ? "merge"
      : actionId === FIXER_PR_CLOSE_ACTION_ID
        ? "close"
        : null;
  if (!kind) return null;
  const channelId = clean(payload.container?.channel_id || payload.channel?.id);
  if (
    clean(payload.team?.id) !== FIXER_PR_SLACK_TEAM_ID ||
    channelId !== FIXER_PR_SLACK_CHANNEL_ID
  )
    return { ignored: true, ok: true, status: "fixer_pr_other_channel" };
  const responseUrl = clean(payload.response_url);
  const userId = clean(payload.user?.id);
  if (!isFixerPrAllowedUser(userId)) {
    if (responseUrl)
      deps.schedule(() =>
        deps
          .respond(responseUrl, ephemeral(FIXER_PR_NOT_ALLOWED_TEXT))
          .catch((error) => console.warn("[fixer-pr/click] notice", error))
      );
    return { ok: true, status: "fixer_pr_not_allowed" };
  }
  const value = parseFixerPrButtonValue(action?.value);
  if (!value || !responseUrl)
    return { ignored: true, ok: true, status: "fixer_pr_invalid_value" };
  // Slack wants the acknowledgement within three seconds; GitHub work follows it.
  deps.schedule(() =>
    runFixerPrClick({ action: kind, deps, responseUrl, userId, value }).catch(
      (error) => console.warn("[fixer-pr/click]", error)
    )
  );
  return { ok: true, status: `fixer_pr_${kind}_started` };
}
