/**
 * Harper's answer options: a raw block after a question whose choices the
 * person can send as their own reply. Web chat and email read the same block.
 */
export type CareerChoice = { label: string; value: string };

export const CAREER_CHOICE_BUTTONS_START = "[[CAREER_CHOICE_BUTTONS]]";
const START_FRAGMENT = "[[CAREER_CHOICE_BUTTONS";
const BLOCK_PATTERN =
  /\[\[CAREER_CHOICE_BUTTONS\]\]\s*([\s\S]*?)\s*\[\[\/CAREER_CHOICE_BUTTONS\]\]/g;
/** A code fence holding nothing but one choice block: the fence is a writing slip, the block still counts. */
const FENCED_BLOCK_PATTERN =
  /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n\s*(\[\[CAREER_CHOICE_BUTTONS\]\][\s\S]*?\[\[\/CAREER_CHOICE_BUTTONS\]\])\s*\n[ \t]{0,3}\1[ \t]*$/gm;
const MAX_CHOICES = 3;
const MIN_CHOICES = 2;

function readChoice(value: unknown): CareerChoice | null {
  if (typeof value === "string") {
    const label = value.trim();
    return label ? { label, value: label } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const choiceValue =
    typeof record.value === "string" ? record.value.trim() : label;
  return label && choiceValue ? { label, value: choiceValue } : null;
}

/** One block's distinct choices, at most three; malformed metadata yields none. */
function readBlock(payload: string): CareerChoice[] {
  try {
    const parsed = JSON.parse(payload.trim()) as unknown;
    const raw = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>).choices
        : null;
    if (!Array.isArray(raw)) return [];
    const choices: CareerChoice[] = [];
    for (const item of raw) {
      const choice = readChoice(item);
      if (!choice || choices.some((known) => known.value === choice.value)) continue;
      choices.push(choice);
      if (choices.length === MAX_CHOICES) break;
    }
    return choices;
  } catch {
    // Malformed UI metadata is hidden instead of shown as raw markers.
    return [];
  }
}

function withoutIncompleteBlock(content: string) {
  const incomplete = content.indexOf(START_FRAGMENT);
  return incomplete === -1 ? content : content.slice(0, incomplete);
}

/**
 * Every complete block in order, each with its own choices (fewer than two means it shows nothing).
 * `marker(index)` replaces block `index`, so a channel can place each set where Harper wrote it.
 */
export function extractCareerChoiceBlocks(
  content: string,
  marker: (index: number) => string = () => ""
) {
  const blocks: CareerChoice[][] = [];
  const replaced = content
    .replace(FENCED_BLOCK_PATTERN, "$2")
    .replace(BLOCK_PATTERN, (_match, payload: string) => {
      const index = blocks.length;
      blocks.push(readBlock(payload));
      return marker(index);
    });
  return {
    content: withoutIncompleteBlock(replaced).trim(),
    blocks: blocks.map((choices) => (choices.length >= MIN_CHOICES ? choices : [])),
  };
}

/** Chat shows one set of choices under the message: the first three distinct ones across its blocks. */
export function extractCareerChoiceButtons(content: string) {
  const { content: stripped, blocks } = extractCareerChoiceBlocks(content);
  const choices: CareerChoice[] = [];
  for (const choice of blocks.flat()) {
    if (choices.length === MAX_CHOICES) break;
    if (!choices.some((known) => known.value === choice.value)) choices.push(choice);
  }
  return { content: stripped, choices: choices.length >= MIN_CHOICES ? choices : [] };
}
