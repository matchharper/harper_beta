const BUTTON_MARKER_START_PATTERN = /\[([^\]\r\n]{1,75})\]\(button:/g;

export const HARPER_SLACK_CHOICE_ACTION_PREFIX = "harper_company_agent_choice:";
export const HARPER_SLACK_CHOICE_BLOCK_PREFIX = "harper_company_agent_choices:";
export const HARPER_SLACK_COMPANY_INFO_ACTION_ID = "harper_company_info_link";

const MAX_SLACK_CHOICES = 2;
const MAX_SLACK_SECTION_LENGTH = 3_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HarperSlackBlock = Record<string, unknown>;

export type HarperSlackChoice = {
  label: string;
  userMessage: string;
};

export type HarperSlackChoiceActionValue = {
  choiceIndex: number;
  sourceJobId: string;
};

type HarperSlackChoiceMarker = HarperSlackChoice & {
  index: number;
  raw: string;
};

function codeCharacterMask(value: string) {
  const mask = new Uint8Array(value.length);
  let fenced = false;
  let inline = false;

  for (let index = 0; index < value.length; index += 1) {
    if (value.startsWith("```", index)) {
      fenced = !fenced;
      inline = false;
      mask[index] = 1;
      mask[index + 1] = 1;
      mask[index + 2] = 1;
      index += 2;
      continue;
    }
    if (!fenced && value[index] === "`") {
      inline = !inline;
      mask[index] = 1;
      continue;
    }
    if (fenced || inline) mask[index] = 1;
  }
  return mask;
}

function cleanRenderedText(value: string) {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function findChoiceMarkers(source: string, codeMask: Uint8Array) {
  const markers: HarperSlackChoiceMarker[] = [];
  let consumedUntil = 0;
  for (const match of source.matchAll(BUTTON_MARKER_START_PATTERN)) {
    const index = match.index ?? 0;
    if (index < consumedUntil || codeMask[index]) continue;
    const messageStart = index + match[0].length;
    let cursor = messageStart;
    let depth = 1;
    let escaped = false;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === "\n" || character === "\r") break;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
      cursor += 1;
    }
    if (depth !== 0) continue;
    const label = match[1].trim();
    const userMessage = source.slice(messageStart, cursor).trim();
    if (!label || !userMessage || userMessage.length > 1_000) continue;
    markers.push({
      index,
      label,
      raw: source.slice(index, cursor + 1),
      userMessage,
    });
    consumedUntil = cursor + 1;
  }
  return markers;
}

/**
 * Extracts the company-side LLM's private Slack button markers. Markers in
 * code spans or fenced code blocks remain literal, and more than two valid
 * markers degrade to their visible labels instead of producing button spam.
 */
export function parseHarperSlackChoiceMarkers(message: string): {
  choices: HarperSlackChoice[];
  text: string;
} {
  const source = String(message ?? "");
  const codeMask = codeCharacterMask(source);
  const matches = findChoiceMarkers(source, codeMask);

  if (matches.length === 0) {
    return { choices: [], text: source.trim() };
  }

  if (matches.length > MAX_SLACK_CHOICES) {
    let text = source;
    for (const match of matches.toReversed()) {
      text = `${text.slice(0, match.index)}${match.label}${text.slice(
        match.index + match.raw.length
      )}`;
    }
    return { choices: [], text: cleanRenderedText(text) };
  }

  const choices = matches.map(({ label, userMessage }) => ({
    label,
    userMessage,
  }));
  let text = source;
  for (const match of matches.toReversed()) {
    text = `${text.slice(0, match.index)}${text.slice(
      match.index + match.raw.length
    )}`;
  }
  return { choices, text: cleanRenderedText(text) };
}

function splitSlackSectionText(value: string) {
  const chunks: string[] = [];
  let remaining = value.trim();
  while (remaining.length > MAX_SLACK_SECTION_LENGTH) {
    const candidate = remaining.slice(0, MAX_SLACK_SECTION_LENGTH);
    const paragraphBreak = candidate.lastIndexOf("\n\n");
    const lineBreak = candidate.lastIndexOf("\n");
    const splitAt =
      paragraphBreak > MAX_SLACK_SECTION_LENGTH / 2
        ? paragraphBreak
        : lineBreak > MAX_SLACK_SECTION_LENGTH / 2
          ? lineBreak
          : MAX_SLACK_SECTION_LENGTH;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export function encodeHarperSlackChoiceActionValue(
  value: HarperSlackChoiceActionValue
) {
  return JSON.stringify({
    choiceIndex: value.choiceIndex,
    sourceJobId: value.sourceJobId,
  });
}

export function decodeHarperSlackChoiceActionValue(
  value: unknown
): HarperSlackChoiceActionValue | null {
  try {
    const parsed = JSON.parse(String(value ?? "")) as Record<string, unknown>;
    const choiceIndex = Number(parsed.choiceIndex);
    const sourceJobId = String(parsed.sourceJobId ?? "").trim();
    if (
      !Number.isInteger(choiceIndex) ||
      choiceIndex < 0 ||
      choiceIndex >= MAX_SLACK_CHOICES ||
      !UUID_PATTERN.test(sourceJobId)
    ) {
      return null;
    }
    return { choiceIndex, sourceJobId };
  } catch {
    return null;
  }
}

export function buildHarperSlackChoiceBlocks(args: {
  choices: HarperSlackChoice[];
  sourceJobId: string;
  text: string;
}): HarperSlackBlock[] {
  const slackText = args.text.replace(
    /(^|\n)```(?:text|plaintext|markdown|md)\s*\n/gi,
    "$1```\n"
  );
  const sections = splitSlackSectionText(
    slackText || "다음 행동을 선택해 주세요."
  ).map((section) => ({
    expand: true,
    type: "section",
    text: { type: "mrkdwn", text: section },
  }));
  const sectionLimit = 50 - (args.choices.length > 0 ? 1 : 0);
  if (args.choices.length === 0) {
    return sections.slice(0, sectionLimit);
  }
  return [
    ...sections.slice(0, sectionLimit),
    {
      type: "actions",
      block_id: `${HARPER_SLACK_CHOICE_BLOCK_PREFIX}${args.sourceJobId}`,
      elements: args.choices
        .slice(0, MAX_SLACK_CHOICES)
        .map((choice, index) => ({
          type: "button",
          action_id: `${HARPER_SLACK_CHOICE_ACTION_PREFIX}${index}`,
          text: { type: "plain_text", text: choice.label, emoji: true },
          value: encodeHarperSlackChoiceActionValue({
            choiceIndex: index,
            sourceJobId: args.sourceJobId,
          }),
        })),
    },
  ];
}

function escapeSlackMrkdwnText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildSelectedHarperSlackChoiceBlocks(args: {
  actionBlockPrefixes?: string[];
  choiceLabel: string;
  originalBlocks: unknown;
  originalText: string;
  slackUserId: string;
}): HarperSlackBlock[] {
  const actionBlockPrefixes = [
    HARPER_SLACK_CHOICE_BLOCK_PREFIX,
    ...(args.actionBlockPrefixes ?? []),
  ];
  const originalBlocks = Array.isArray(args.originalBlocks)
    ? (args.originalBlocks.filter((block) => {
        if (!block || typeof block !== "object") return false;
        const record = block as Record<string, unknown>;
        return !(
          record.type === "actions" &&
          actionBlockPrefixes.some((prefix) =>
            String(record.block_id ?? "").startsWith(prefix)
          )
        );
      }) as HarperSlackBlock[])
    : buildHarperSlackChoiceBlocks({
        choices: [],
        sourceJobId: "",
        text: args.originalText,
      });
  const selectedText = `✓ <@${args.slackUserId}> → *${escapeSlackMrkdwnText(
    args.choiceLabel
  )}*`;
  return [
    ...originalBlocks.slice(0, 49),
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: selectedText }],
    },
  ];
}
