import type { HarperSlackBlock } from "@/lib/org/slackChoiceButtons";
import { formatSlackLink } from "@/lib/org/slackMessages";
import {
  asRecord,
  clean,
  escapeMrkdwn,
  FIXER_DEPLOY_NOT_ALLOWED_TEXT,
  FIXER_INCIDENTS_URL,
  FIXER_PR_GITHUB_OWNER,
  FIXER_PR_SLACK_CHANNEL_ID,
  FIXER_PR_SLACK_TEAM_ID,
  findFixerIncidentThread,
  firstBlockId,
  fixerPickRecordLine,
  fixerThreadFields,
  fixerWakeLine,
  formatFixerPrSeoulTime,
  isFixerDeployAllowedUser,
  markdownLineToMrkdwn,
  plainText,
  readFixerIncidentPostKey,
  readFixerQaHistory,
  section,
  type FixerPrSlackCall,
  type FixerPrWebhookResult,
  type FixerWakeResult,
} from "./fixerPrSlack";

/**
 * The incident fixer agent speaks in #qa through the Harper bot (11/9 decision:
 * "하퍼가 얘기하는것으로해"). The agent cannot post as the bot, so it adds a
 * harper_incidents issue comment carrying a hidden `harper-qa` block; GitHub's
 * `issue_comment` webhook brings it here and the bot posts it under the
 * incident's #qa post, shown in the channel too. A choice card's buttons are
 * answered here: the card becomes the record the agent reads back, then the
 * agent's scheduled task is started through its API trigger.
 */

export const FIXER_INCIDENTS_REPO_FULL_NAME = `${FIXER_PR_GITHUB_OWNER}/harper_incidents`;
/**
 * The answers a fixer choice card can offer (FIXER.md): what to do with an
 * incident (13-1), and whether other work waiting in the release goes out
 * with it (13-2, 13-4).
 */
export const FIXER_CHOICE_ACTION_IDS = {
  decline: "harper_fixer_choice_decline",
  deploy: "harper_fixer_choice_deploy",
  pr: "harper_fixer_choice_pr",
  ride_along: "harper_fixer_choice_ride_along",
  wait: "harper_fixer_choice_wait",
} as const;
export type FixerChoice = keyof typeof FIXER_CHOICE_ACTION_IDS;
export const FIXER_CHOICE_LABELS: Record<FixerChoice, string> = {
  decline: "하지 않기",
  deploy: "배포까지 하기",
  pr: "PR 작성하기",
  ride_along: "같이 내보내기",
  wait: "기다리기",
};
/** Asked before a press goes through; a choice without one is easy to take back. */
const CHOICE_CONFIRMS: Partial<Record<FixerChoice, { text: string; yes: string }>> = {
  decline: { text: "이 사건은 다시 묻지 않아요. 괜찮을까요?", yes: "하지 않기" },
  deploy: {
    text: "PR부터 머지, 운영 배포까지 수정 에이전트가 이어서 해요. 시작할까요?",
    yes: "시작",
  },
  ride_along: {
    text: "기다리던 다른 작업도 이번 운영 배포에 같이 나가요. 괜찮을까요?",
    yes: "같이 내보내기",
  },
};
/** What happens next, on the card once picked. Terminal choices wake no one for long. */
const CHOICE_NEXT: Record<FixerChoice, string> = {
  decline: "이 사건은 다시 묻지 않아요.",
  deploy: "수정 에이전트가 곧 시작해요.",
  pr: "수정 에이전트가 곧 PR을 만들어요.",
  ride_along: "수정 에이전트가 같이 내보내고 이어서 해요.",
  wait: "배포는 여기서 멈춰요.",
};
const TERMINAL_CHOICES = new Set<FixerChoice>(["decline", "wait"]);
const DEFAULT_OPTIONS: FixerChoice[] = ["pr", "deploy", "decline"];
/** Supabase Vault names for the fixer task's API trigger (claude.ai scheduled task). */
export const FIXER_WAKE_URL_SECRET = "fixer_routine_fire_url";
export const FIXER_WAKE_TOKEN_SECRET = "fixer_routine_fire_token";
export const FIXER_WAKE_SECRETS_TTL_MS = 5 * 60 * 1000;
/** Only a scheduled task's own fire endpoint receives the token. */
const WAKE_URL_PATTERN =
  /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;
const WAKE_TIMEOUT_MS = 8_000;
const WAKE_BETA = "experimental-cc-routine-2026-04-01";

const MARKER_PATTERN = /<!--\s*harper-qa\s*([\s\S]*?)-->/;
const CHOICE_BLOCK_ID = "harper_fixer_choice";
const PICKED_BLOCK_ID = "harper_fixer_choice_picked";
const NOTICE_BLOCK_ID = "harper_fixer_notice";
const CHOICE_ACTIONS_BLOCK_ID = "harper_fixer_choice_actions";
const TITLE_MAX_CHARS = 120;
const LINE_MAX_CHARS = 200;
const LINES_MAX = 4;
const NOTICE_MAX_CHARS = 600;
const NOTICE_MAX_LINES = 4;
/**
 * Who may write a `harper-qa` block: people with access to the private
 * repository. A member whose organization membership is private can arrive as
 * CONTRIBUTOR; committing to a private repository already takes access.
 */
const COMMENT_AUTHOR_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR", "CONTRIBUTOR"]);
const SLACK_TS_PATTERN = /^\d{9,12}\.\d{6}$/;

/** `threadTs`: the incident's #qa post as the fixer agent found it; the post goes in its thread. */
export type FixerQaMarker = { threadTs?: string } & (
  | {
      incident: number;
      kind: "choice";
      lines: string[];
      options: FixerChoice[];
      recommended: FixerChoice;
      title: string;
    }
  | { incident: number; kind: "notice"; text: string }
);

const isChoice = (value: unknown): value is FixerChoice =>
  typeof value === "string" && Object.hasOwn(FIXER_CHOICE_ACTION_IDS, value);

const chars = (value: string) => Array.from(value).length;

/**
 * The `harper-qa` block of a comment:
 * `<!-- harper-qa {"kind":"choice","incident":87,"title":"…","lines":["…"],"recommended":"pr"} -->`
 * (optional `"options"`: two or three of the choices, default PR 작성하기 /
 * 배포까지 하기 / 하지 않기) or `{"kind":"notice","incident":87,"text":"…"}`.
 * Either may name `"thread_ts"`, the incident's #qa post; one that is not a
 * Slack timestamp is left out. Anything else is not ours.
 */
export function parseFixerQaMarker(body: unknown): FixerQaMarker | null {
  const match = MARKER_PATTERN.exec(String(body ?? ""));
  if (!match) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(match[1]));
  } catch {
    return null;
  }
  const incident = parsed.incident;
  if (typeof incident !== "number" || !Number.isSafeInteger(incident) || incident <= 0)
    return null;
  const threadTs = typeof parsed.thread_ts === "string" ? parsed.thread_ts.trim() : "";
  const thread = SLACK_TS_PATTERN.test(threadTs) ? { threadTs } : {};
  if (parsed.kind === "notice") {
    const text = clean(parsed.text);
    const lines = text.split("\n");
    if (!text || chars(text) > NOTICE_MAX_CHARS || lines.length > NOTICE_MAX_LINES)
      return null;
    return { incident, kind: "notice", text, ...thread };
  }
  if (parsed.kind !== "choice") return null;
  const title = clean(parsed.title);
  if (!title || chars(title) > TITLE_MAX_CHARS || title.includes("\n")) return null;
  const rawLines = parsed.lines ?? [];
  if (!Array.isArray(rawLines) || rawLines.length > LINES_MAX) return null;
  const lines = rawLines.map(clean);
  if (lines.some((line) => !line || chars(line) > LINE_MAX_CHARS || line.includes("\n")))
    return null;
  const rawOptions = parsed.options ?? DEFAULT_OPTIONS;
  if (
    !Array.isArray(rawOptions) ||
    rawOptions.length < 2 ||
    rawOptions.length > 3 ||
    !rawOptions.every(isChoice) ||
    new Set(rawOptions).size !== rawOptions.length
  )
    return null;
  const options = rawOptions as FixerChoice[];
  const recommended = parsed.recommended ?? options[0];
  if (!isChoice(recommended) || !options.includes(recommended)) return null;
  return { incident, kind: "choice", lines, options, recommended, title, ...thread };
}

const incidentLink = (incident: number) =>
  formatSlackLink(`${FIXER_INCIDENTS_URL}/${incident}`, `사건 #${incident}`);

export type FixerChoiceValue = { incident: number; offer: number };

export function encodeFixerChoiceValue(value: FixerChoiceValue) {
  return JSON.stringify({ incident: value.incident, offer: value.offer });
}

export function parseFixerChoiceValue(value: unknown): FixerChoiceValue | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = asRecord(JSON.parse(String(value ?? "")));
  } catch {
    return null;
  }
  const { incident, offer } = parsed;
  const valid = (number: unknown): number is number =>
    typeof number === "number" && Number.isSafeInteger(number) && number > 0;
  return valid(incident) && valid(offer) ? { incident, offer } : null;
}

export type FixerQaPost = { blocks: HarperSlackBlock[]; text: string };

/** The question with [PR 작성하기] / [배포까지 하기] / [하지 않기] (FIXER.md 13-1). */
export function buildFixerChoiceCard(args: {
  marker: Extract<FixerQaMarker, { kind: "choice" }>;
  offer: number;
}): FixerQaPost {
  const { marker, offer } = args;
  const value = encodeFixerChoiceValue({ incident: marker.incident, offer });
  const button = (choice: FixerChoice) => {
    const confirm = CHOICE_CONFIRMS[choice];
    return {
      type: "button",
      action_id: FIXER_CHOICE_ACTION_IDS[choice],
      ...(marker.recommended === choice ? { style: "primary" } : {}),
      text: plainText(FIXER_CHOICE_LABELS[choice]),
      value,
      ...(confirm
        ? {
            confirm: {
              title: plainText(FIXER_CHOICE_LABELS[choice]),
              text: plainText(confirm.text),
              confirm: plainText(confirm.yes),
              deny: plainText("취소"),
            },
          }
        : {}),
    };
  };
  return {
    blocks: [
      section(
        `${CHOICE_BLOCK_ID}:${marker.incident}:${offer}`,
        [
          `*${incidentLink(marker.incident)} · 어떻게 할까요?*`,
          markdownLineToMrkdwn(marker.title),
          ...marker.lines.map((line) => `> ${markdownLineToMrkdwn(line)}`),
        ].join("\n")
      ),
      {
        type: "actions",
        block_id: CHOICE_ACTIONS_BLOCK_ID,
        elements: marker.options.map(button),
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: FIXER_DEPLOY_NOT_ALLOWED_TEXT }],
      },
    ],
    text: `사건 #${marker.incident} · 어떻게 할까요? ${escapeMrkdwn(marker.title)}`,
  };
}

/** One line from the fixer agent, under the incident's #qa post. */
export function buildFixerNotice(args: {
  commentId: number;
  marker: Extract<FixerQaMarker, { kind: "notice" }>;
}): FixerQaPost {
  const { commentId, marker } = args;
  const lines = marker.text.split("\n").map(markdownLineToMrkdwn);
  return {
    blocks: [
      section(
        `${NOTICE_BLOCK_ID}:${marker.incident}:${commentId}`,
        `${incidentLink(marker.incident)} ${lines.join("\n")}`
      ),
    ],
    text: `사건 #${marker.incident} ${escapeMrkdwn(marker.text)}`,
  };
}

/** After a pick: who chose what, when, and when the fixer starts. No buttons. */
export function buildFixerChoicePickedCard(args: {
  at: Date;
  by: string;
  choice: FixerChoice;
  /** The question card's text, from the pressed message: what the incident is. */
  questionText: string;
  value: FixerChoiceValue;
  wake: FixerWakeResult | "pending";
}): FixerQaPost {
  const { at, by, choice, value } = args;
  const label = FIXER_CHOICE_LABELS[choice];
  // The question's first line asks; the rest says what the incident is.
  const about = args.questionText.split("\n").slice(1).join("\n").trim();
  const next = TERMINAL_CHOICES.has(choice)
    ? CHOICE_NEXT[choice]
    : fixerWakeLine(args.wake, CHOICE_NEXT[choice]);
  return {
    blocks: [
      section(
        `${PICKED_BLOCK_ID}:${value.incident}:${value.offer}:${choice}`,
        [
          [`✅ <@${clean(by)}>님이 *${label}*를 골랐어요`, formatFixerPrSeoulTime(at)]
            .filter(Boolean)
            .join(" · "),
          `${incidentLink(value.incident)}${about ? ` ${about}` : ""}`,
          next,
        ].join("\n")
      ),
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: fixerPickRecordLine([
              `사건 ${value.incident}`,
              choice,
              clean(by),
              at.toISOString(),
              `댓글 ${value.offer}`,
            ]),
          },
        ],
      },
    ],
    text: `✅ ${label}를 골랐어요 · 사건 #${value.incident}`,
  };
}

/** The issue comment a delivery is about, or why it is not ours to post. */
export function fixerIncidentCommentTarget(
  payload: unknown
): { commentId: number; marker: FixerQaMarker } | { ignore: string } {
  const record = asRecord(payload);
  if (clean(record.action) !== "created")
    return { ignore: `action_${clean(record.action) || "missing"}` };
  if (clean(asRecord(record.repository).full_name) !== FIXER_INCIDENTS_REPO_FULL_NAME)
    return { ignore: "unknown_repo" };
  const issue = asRecord(record.issue);
  if (issue.pull_request) return { ignore: "pull_request_comment" };
  const comment = asRecord(record.comment);
  const marker = parseFixerQaMarker(comment.body);
  if (!marker) return { ignore: "no_marker" };
  if (!COMMENT_AUTHOR_ASSOCIATIONS.has(clean(comment.author_association)))
    return { ignore: "author_not_member" };
  if (issue.number !== marker.incident) return { ignore: "incident_mismatch" };
  const commentId = comment.id;
  if (typeof commentId !== "number" || !Number.isSafeInteger(commentId) || commentId <= 0)
    return { ignore: "invalid_payload" };
  return { commentId, marker };
}

export type FixerIncidentCommentDeps = {
  botUserId: () => Promise<string>;
  now?: () => Date;
  slack: FixerPrSlackCall;
};

/**
 * harper_incidents `issue_comment` (signature already checked): posts the
 * comment's `harper-qa` block once. Works inline so GitHub records a failed
 * delivery when nothing was posted; a redelivery finds its post and stops.
 * If the channel read fails, the post still goes out, in the thread the
 * block names (without the check for an earlier post).
 */
export async function runFixerIncidentComment(
  payload: unknown,
  deps: FixerIncidentCommentDeps
): Promise<FixerPrWebhookResult> {
  const target = fixerIncidentCommentTarget(payload);
  if ("ignore" in target)
    return { body: { ignored: true, ok: true, reason: target.ignore }, status: 200 };
  const { commentId, marker } = target;
  const summary = { comment: commentId, incident: marker.incident, kind: marker.kind };
  try {
    const botUserId = await deps.botUserId();
    const messages = await readFixerQaHistory({
      now: deps.now?.() ?? new Date(),
      slack: deps.slack,
    }).catch((error): unknown[] => {
      console.warn("[fixer-qa/webhook] #qa not read; posting without the lookup", {
        ...summary,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    });
    const posted = messages.find((message) => {
      const key = readFixerIncidentPostKey(message);
      return (
        clean(asRecord(message).user) === botUserId &&
        key?.incident === marker.incident &&
        key.commentId === commentId
      );
    });
    if (posted)
      return {
        body: { ok: true, ...summary, reason: "already_posted", result: "skipped" },
        status: 200,
      };
    const threadTs =
      marker.threadTs ??
      findFixerIncidentThread({ botUserId, incident: marker.incident, messages });
    const post =
      marker.kind === "choice"
        ? buildFixerChoiceCard({ marker, offer: commentId })
        : buildFixerNotice({ commentId, marker });
    const result = await deps.slack("chat.postMessage", {
      blocks: JSON.stringify(post.blocks),
      channel: FIXER_PR_SLACK_CHANNEL_ID,
      text: post.text,
      ...fixerThreadFields(threadTs),
      unfurl_links: false,
      unfurl_media: false,
    });
    return {
      body: {
        ok: true,
        ...summary,
        result: "posted",
        ts: clean(result.ts) || null,
        ...(threadTs ? { thread_ts: threadTs } : {}),
      },
      status: 200,
    };
  } catch (error) {
    console.error("[fixer-qa/webhook] Slack post not written", {
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

export type FixerChoiceSlackPayload = {
  actions?: Array<{ action_id?: string; value?: string }>;
  channel?: { id?: string };
  container?: { channel_id?: string; message_ts?: string };
  message?: { blocks?: unknown; ts?: string };
  response_url?: string;
  team?: { id?: string };
  type?: string;
  user?: { id?: string };
};

export type FixerChoiceClickDeps = {
  now?: () => Date;
  respond: (responseUrl: string, body: Record<string, unknown>) => Promise<void>;
  schedule: (task: () => Promise<void>) => void;
  slack: FixerPrSlackCall;
  /** Starts the fixer agent's run now; absent when that is not set up. */
  wake?: (text: string) => Promise<FixerWakeResult>;
};

const ephemeral = (text: string) => ({
  replace_original: false,
  response_type: "ephemeral",
  text,
});

function choiceOf(actionId: string): FixerChoice | null {
  for (const choice of Object.keys(FIXER_CHOICE_ACTION_IDS) as FixerChoice[])
    if (FIXER_CHOICE_ACTION_IDS[choice] === actionId) return choice;
  return null;
}

/** The pressed card's question text (first section), as the bot wrote it. */
function questionTextOf(message: unknown) {
  const blocks = asRecord(message).blocks;
  const block = Array.isArray(blocks) ? asRecord(blocks[0]) : {};
  return String(asRecord(block.text).text ?? "");
}

/**
 * [PR 작성하기] / [배포까지 하기] / [하지 않기] on a fixer choice card. Returns
 * null for other actions. Only the one allowed person in #qa picks; the card
 * becomes the record first, and only then is the fixer agent woken.
 */
export async function routeFixerChoiceSlackAction(
  payload: FixerChoiceSlackPayload,
  deps: FixerChoiceClickDeps
) {
  if (payload.type !== "block_actions") return null;
  const action = payload.actions?.[0];
  const choice = choiceOf(clean(action?.action_id));
  if (!choice) return null;
  const channelId = clean(payload.container?.channel_id || payload.channel?.id);
  if (
    clean(payload.team?.id) !== FIXER_PR_SLACK_TEAM_ID ||
    channelId !== FIXER_PR_SLACK_CHANNEL_ID
  )
    return { ignored: true, ok: true, status: "fixer_choice_other_channel" };
  const responseUrl = clean(payload.response_url);
  const notify = (text: string) =>
    responseUrl
      ? deps.respond(responseUrl, ephemeral(text)).catch((error) =>
          console.warn("[fixer-choice/click] notice", error)
        )
      : Promise.resolve();
  const userId = clean(payload.user?.id);
  if (!isFixerDeployAllowedUser(userId)) {
    deps.schedule(() => notify(FIXER_DEPLOY_NOT_ALLOWED_TEXT));
    return { ok: true, status: "fixer_choice_not_allowed" };
  }
  const value = parseFixerChoiceValue(action?.value);
  const messageTs = clean(payload.container?.message_ts || payload.message?.ts);
  if (!value || !messageTs) return { ignored: true, ok: true, status: "fixer_choice_invalid_value" };
  // The pressed message must still be this question; a picked card has no buttons.
  if (firstBlockId(payload.message) !== `${CHOICE_BLOCK_ID}:${value.incident}:${value.offer}`) {
    deps.schedule(() => notify("이미 고른 카드예요. 아무것도 바꾸지 않았어요."));
    return { ok: true, status: "fixer_choice_already_picked" };
  }
  const questionText = questionTextOf(payload.message);
  deps.schedule(() =>
    runFixerChoicePick({ choice, deps, messageTs, notify, questionText, userId, value }).catch(
      (error) => console.warn("[fixer-choice/click]", error)
    )
  );
  return { ok: true, status: `fixer_choice_${choice}_started` };
}

async function runFixerChoicePick(args: {
  choice: FixerChoice;
  deps: FixerChoiceClickDeps;
  messageTs: string;
  notify: (text: string) => Promise<void>;
  questionText: string;
  userId: string;
  value: FixerChoiceValue;
}) {
  const { choice, deps, userId, value } = args;
  const at = (deps.now ?? (() => new Date()))();
  const draw = (wake: FixerWakeResult | "pending") =>
    buildFixerChoicePickedCard({
      at,
      by: userId,
      choice,
      questionText: args.questionText,
      value,
      wake,
    });
  const update = (post: FixerQaPost) =>
    deps.slack("chat.update", {
      blocks: JSON.stringify(post.blocks),
      channel: FIXER_PR_SLACK_CHANNEL_ID,
      text: post.text,
      ts: args.messageTs,
    });
  try {
    await update(draw(deps.wake ? "pending" : "not_configured"));
  } catch (error) {
    console.warn("[fixer-choice/click] pick not recorded", error);
    return args.notify("카드에 기록하지 못해 아무것도 하지 않았어요. 잠시 후 다시 눌러 주세요.");
  }
  if (!deps.wake) return;
  const result = await deps
    .wake(
      [
        `#qa 카드에서 ${FIXER_CHOICE_LABELS[choice]}(${choice})를 골랐어요: 사건 #${value.incident}`,
        `카드 ts ${args.messageTs}`,
        `누른 사람 ${userId}`,
        at.toISOString(),
      ].join(" · ") +
        ". 이 글은 깨우는 신호예요. 선택은 #qa의 Harper 카드(선택 기록 줄)에서 직접 확인하세요."
    )
    .catch((error): FixerWakeResult => {
      console.warn("[fixer-choice/click] wake failed", error);
      return "failed";
    });
  if (result === "woken" || TERMINAL_CHOICES.has(choice)) return;
  await update(draw(result)).catch((error) =>
    console.warn("[fixer-choice/click] wake line not updated", error)
  );
}

export type FixerWakeConfig = { token: string; url: string };

/** The fire URL and token from the Vault, cached for five minutes; missing: null. */
export function createFixerWakeConfigLoader(args: {
  now?: () => number;
  query: (names: string[]) => Promise<Array<{ decrypted_secret?: unknown; name?: unknown }>>;
  ttlMs?: number;
}) {
  let cached: { at: number; config: FixerWakeConfig | null } | null = null;
  return async function loadFixerWakeConfig(): Promise<FixerWakeConfig | null> {
    const now = (args.now ?? Date.now)();
    if (cached && now - cached.at < (args.ttlMs ?? FIXER_WAKE_SECRETS_TTL_MS))
      return cached.config;
    let rows: Array<{ decrypted_secret?: unknown; name?: unknown }>;
    try {
      rows = await args.query([FIXER_WAKE_URL_SECRET, FIXER_WAKE_TOKEN_SECRET]);
    } catch (error) {
      console.warn(
        "[fixer-wake] Vault secrets unavailable",
        error instanceof Error ? error.message : String(error)
      );
      return null;
    }
    const secret = (name: string) =>
      clean(rows.find((row) => row.name === name)?.decrypted_secret);
    const url = secret(FIXER_WAKE_URL_SECRET);
    const token = secret(FIXER_WAKE_TOKEN_SECRET);
    const config = url && token && WAKE_URL_PATTERN.test(url) ? { token, url } : null;
    if (!config && (url || token))
      console.warn("[fixer-wake] Vault secret missing or URL not a fire endpoint", {
        token: Boolean(token),
        url: Boolean(url),
      });
    cached = { at: now, config };
    return config;
  };
}

/**
 * Starts the fixer agent's scheduled task now (its API trigger). The text is
 * only a wake-up signal: the task reads the pick from the card itself.
 */
export function createFixerWake(args: {
  fetch?: typeof fetch;
  loadConfig: () => Promise<FixerWakeConfig | null>;
  timeoutMs?: number;
}) {
  const fetchImpl = args.fetch ?? fetch;
  return async function wakeFixer(text: string): Promise<FixerWakeResult> {
    const config = await args.loadConfig();
    if (!config) return "not_configured";
    try {
      const response = await fetchImpl(config.url, {
        body: JSON.stringify({ text }),
        headers: {
          "anthropic-beta": WAKE_BETA,
          "anthropic-version": "2023-06-01",
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(args.timeoutMs ?? WAKE_TIMEOUT_MS),
      });
      if (response.ok) return "woken";
      console.warn("[fixer-wake] fire refused", response.status);
      return "failed";
    } catch (error) {
      console.warn(
        "[fixer-wake] fire failed",
        error instanceof Error ? error.message : String(error)
      );
      return "failed";
    }
  };
}
