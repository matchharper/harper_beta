/**
 * #5 검색 예산 나누기 (Shaun 11/18): the agent splits each day's search budget over the places it can search, from
 * what earlier days' money brought, instead of fixed shares (the open-web share, Hacker News' $0.4, the layoff
 * method's 40%). Code keeps only the day's total (tickRules.ts SIGNAL_BUDGET_MAX / SIGNAL_BUDGET_SHARE).
 *
 * Exploit and explore (Shaun: "잘 나오는 곳에 더 쓰되, 로컬 미니마에 빠지지 않게 랜덤성도"): each day code rolls one
 * die per option (Thompson sampling): a draw of "people with a fitting posting per dollar" from what that option
 * brought (Gamma posterior of a Poisson rate, weak prior). An option with good numbers tends to draw high; one with
 * little data swings widely, so it sometimes comes out on top and gets a real test; as data piles up the swings
 * shrink and the testing fades by itself. The dice split (draws normalized) is the agent's starting point; it moves
 * away only for a reason it can see in the numbers and says why. When the call fails, the dice split is used as is.
 *
 * Pure: the run, the tests and the prompt-version hash share it.
 */
import { EXPLORE_SOURCE, cleanOpsText, signalSourceInfo } from "./signals";

/** An option id: a search's source id ("linkedin", "hn", "explore"), or "<source>:layoff" for its layoff method. */
export type BudgetOptionId = string;
export const LAYOFF_OPTION_SUFFIX = ":layoff";

/** How many past days the plan reads, and the smallest amount a search runs with. */
export const BUDGET_HISTORY_DAYS = 14;
export const MIN_SEARCH_USD = 0.05;

/** The dice's prior: as if each option had found this many people with a fitting posting for this many dollars. */
export const DICE_PRIOR = { fits: 1, usd: 1 } as const;

export type BudgetOption = {
  id: BudgetOptionId;
  /** The search (one per tick) that spends it: its source id. */
  search: string;
  part: "signal" | "layoff";
  label: string;
  about: string;
};

/** What one option's money brought over the days read (finished runs only). */
export type BudgetTally = {
  runs: number;
  givenUsd: number;
  spentUsd: number;
  people: number;
  /** People with at least one fitting posting (they could be mailed). */
  fits: number;
  sent: number;
  clicked: number;
  signedUp: number;
  connected: number;
};

export const EMPTY_TALLY: BudgetTally = { runs: 0, givenUsd: 0, spentUsd: 0, people: 0, fits: 0, sent: 0, clicked: 0, signedUp: 0, connected: 0 };

export type BudgetAllocation = { option: BudgetOptionId; usd: number; why: string };

/** A day's split, kept on its run (gtm_agent_runs.signal_log.budget). */
export type BudgetPlan = {
  at: string;
  totalUsd: number;
  /** The dice split (share of the total per option) the agent started from. */
  dice: Record<BudgetOptionId, number>;
  allocations: BudgetAllocation[];
  note: string;
  /** agent: the model's split; dice: the dice split as is (the call failed or gave nothing usable). */
  by: "agent" | "dice";
  error?: string | null;
};

const ABOUT: Record<string, string> = {
  linkedin: "LinkedIn posts and profiles where people say they are looking for a job (web search on linkedin.com).",
  [`linkedin${LAYOFF_OPTION_SUFFIX}`]: "Recent layoff news first, then people from those companies on LinkedIn who say they are looking (one news step, then up to two rounds).",
  hn: "Hacker News 'Who wants to be hired' threads through their free API: the money only pays the judge for comments not judged before, so it seldom needs much.",
  [EXPLORE_SOURCE]: "The open web outside the turned-on places (personal sites, blogs, forums); new places show up here.",
};

/**
 * The options of a day: each turned-on place (in the settings' order), LinkedIn's layoff method when it is on, and
 * the open web.
 */
export function budgetOptions(args: { turnedOn: readonly string[]; layoffSearch: boolean }): BudgetOption[] {
  const options: BudgetOption[] = [];
  for (const source of args.turnedOn) {
    if (source === EXPLORE_SOURCE) continue;
    const label = signalSourceInfo(source).label;
    options.push({ id: source, search: source, part: "signal", label, about: ABOUT[source] ?? `${label}: web search on its own domains.` });
    if (source === "linkedin" && args.layoffSearch) {
      const id = `${source}${LAYOFF_OPTION_SUFFIX}`;
      options.push({ id, search: source, part: "layoff", label: `${label} 감원 뉴스`, about: ABOUT[id] });
    }
  }
  options.push({ id: EXPLORE_SOURCE, search: EXPLORE_SOURCE, part: "signal", label: signalSourceInfo(EXPLORE_SOURCE).label, about: ABOUT[EXPLORE_SOURCE] });
  return options;
}

/** The searches of a day in order (one per tick): the options' sources, each once. */
export function budgetSearches(options: readonly BudgetOption[]): string[] {
  return [...new Set(options.map((option) => option.search))];
}

// ---------------------------------------------------------------------------------------------------------------
// The dice

/** One standard normal draw (Box-Muller). */
function normal(random: () => number): number {
  const u = Math.max(random(), Number.EPSILON);
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** One Gamma(shape, rate) draw (Marsaglia-Tsang; shape below 1 through the usual boost). */
export function gammaDraw(shape: number, rate: number, random: () => number): number {
  if (shape < 1) return gammaDraw(shape + 1, rate, random) * Math.pow(Math.max(random(), Number.EPSILON), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = normal(random);
    let v = 1 + c * x;
    while (v <= 0) {
      x = normal(random);
      v = 1 + c * x;
    }
    v = v * v * v;
    const u = Math.max(random(), Number.EPSILON);
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return (d * v) / rate;
  }
}

/**
 * Today's dice split: one draw per option of people with a fitting posting per dollar (Gamma(prior + fits, prior +
 * spent)), as shares of their sum (rounded, summing to about 1).
 */
export function rollBudgetDice(
  options: readonly BudgetOption[], tallies: Readonly<Record<string, BudgetTally>>, random: () => number = Math.random,
): Record<BudgetOptionId, number> {
  const draws = options.map((option) => {
    const tally = tallies[option.id] ?? EMPTY_TALLY;
    return { id: option.id, draw: gammaDraw(DICE_PRIOR.fits + Math.max(0, tally.fits), DICE_PRIOR.usd + Math.max(0, tally.spentUsd), random) };
  });
  const sum = draws.reduce((total, item) => total + item.draw, 0);
  return Object.fromEntries(draws.map((item) => [item.id, sum > 0 ? Math.round((item.draw / sum) * 1000) / 1000 : 1 / draws.length]));
}

/** The dice split in dollars (cents, never over the total). */
export function diceAllocations(options: readonly BudgetOption[], dice: Readonly<Record<string, number>>, totalUsd: number): BudgetAllocation[] {
  return fitToTotal(options.map((option) => ({ option: option.id, usd: cents(totalUsd * (dice[option.id] ?? 0)), why: "주사위 배분 그대로" })), totalUsd);
}

// ---------------------------------------------------------------------------------------------------------------
// The agent's call

export const BUDGET_PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["allocations", "note"],
  properties: {
    allocations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["option", "usd", "why"],
        properties: { option: { type: "string" }, usd: { type: "number" }, why: { type: "string" } },
      },
    },
    note: { type: "string" },
  },
} as const;

export const BUDGET_PLAN_SYSTEM = `You split today's search budget of Harper's candidate-sourcing agent over the places it can search.
The goal is people who are looking for a job AND get at least one fitting posting from Harper (they can be mailed), per dollar; mails that lead to clicks, signups and company connections count most once there are any.

How to split:
- Give every option an amount in USD (0 is allowed). The total is fixed; amounts over it are scaled down.
- Start from today's dice split. The dice are drawn each day from the past numbers: options that brought people with a fitting posting for little money tend to draw high, options with little data swing widely, so they sometimes come out on top and get tested. This keeps the search from settling on one place too early.
- Move money away from the dice only for a reason you can see in the numbers, and say it. For example: an option spent much less than it was given before (more money would sit unused); an option keeps finding people but almost none of them get a fitting posting or can be mailed.
- One day is a small sample. Do not drop an option to 0 because of one bad day; an option with little or no data still deserves a real test.
- Money a finished search does not use goes to the day's later searches, so giving an option a little more than it needs wastes nothing.

Write each "why" and the "note" in Korean, one short plain sentence each, without internal ids.`;

const money = (usd: number) => `$${usd.toFixed(2)}`;
const percent = (share: number) => `${Math.round(share * 100)}%`;

function tallyLine(tally: BudgetTally): string {
  if (!tally.runs) return "no data yet";
  return [
    `${tally.runs} run${tally.runs === 1 ? "" : "s"}`, `given ${money(tally.givenUsd)}`, `spent ${money(tally.spentUsd)}`,
    `people kept ${tally.people}`, `with a fitting posting ${tally.fits}`, `mailed ${tally.sent}`, `clicked ${tally.clicked}`,
    `signed up ${tally.signedUp}`, `connected ${tally.connected}`,
  ].join(" · ");
}

/** The user message: today's total and options, what each option's money brought, the last plan, the dice. */
export function budgetPlanPrompt(args: {
  day: string; totalUsd: number; options: readonly BudgetOption[]; tallies: Readonly<Record<string, BudgetTally>>;
  dice: Readonly<Record<string, number>>; lastPlan: { day: string; plan: BudgetPlan } | null; historyDays?: number;
}): string {
  const days = args.historyDays ?? BUDGET_HISTORY_DAYS;
  const lines = [
    `Today (Korea time): ${args.day}. Total search budget: ${money(args.totalUsd)}.`,
    "",
    "Options (option id: what it is):",
    ...args.options.map((option) => `- ${option.id}: ${option.about}`),
    "",
    `What each option's money brought in the last ${days} days (finished runs, test runs left out; people found today are not matched yet):`,
    ...args.options.map((option) => `- ${option.id}: ${tallyLine(args.tallies[option.id] ?? EMPTY_TALLY)}`),
  ];
  if (args.lastPlan) {
    const { plan } = args.lastPlan;
    lines.push("", `The last split (${args.lastPlan.day}, total ${money(plan.totalUsd)}):`,
      ...plan.allocations.map((item) => `- ${item.option}: ${money(item.usd)} · ${cleanOpsText(item.why, 200).replace(/\s+/g, " ")}`));
    if (plan.note) lines.push(`Note: ${cleanOpsText(plan.note, 300).replace(/\s+/g, " ")}`);
  }
  lines.push("", "Today's dice split (share of the total):", ...args.options.map((option) => `- ${option.id}: ${percent(args.dice[option.id] ?? 0)}`));
  return lines.join("\n");
}

const cents = (usd: number) => Math.max(0, Math.floor(usd * 100 + 1e-6) / 100);

/** Allocations scaled down (to the cent) when they add up to more than the total. */
function fitToTotal(allocations: BudgetAllocation[], totalUsd: number): BudgetAllocation[] {
  const sum = allocations.reduce((total, item) => total + item.usd, 0);
  if (sum <= totalUsd + 1e-9) return allocations;
  const factor = totalUsd / sum;
  return allocations.map((item) => ({ ...item, usd: cents(item.usd * factor) }));
}

/**
 * The model's answer as a split of `totalUsd`: one allocation per option in the options' order (an option it left
 * out gets 0, an unknown one is dropped), amounts in cents, never over the total. null when nothing usable (no amount
 * above 0).
 */
export function readBudgetAnswer(raw: unknown, options: readonly BudgetOption[], totalUsd: number): { allocations: BudgetAllocation[]; note: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as { allocations?: unknown; note?: unknown };
  const answered = new Map<string, { usd: number; why: string }>();
  for (const item of Array.isArray(record.allocations) ? record.allocations : []) {
    if (!item || typeof item !== "object") continue;
    const { option, usd, why } = item as { option?: unknown; usd?: unknown; why?: unknown };
    if (typeof option !== "string" || answered.has(option)) continue;
    const amount = typeof usd === "number" && Number.isFinite(usd) ? cents(usd) : 0;
    answered.set(option, { usd: amount, why: cleanOpsText(why, 200).replace(/\s+/g, " ") });
  }
  const allocations = fitToTotal(options.map((option) => ({
    option: option.id, usd: answered.get(option.id)?.usd ?? 0, why: answered.get(option.id)?.why ?? "",
  })), totalUsd);
  if (!allocations.some((item) => item.usd > 0)) return null;
  return { allocations, note: cleanOpsText(record.note, 300).replace(/\s+/g, " ") };
}

/** A plan read back from the run (anything malformed: null, and the day is planned again). */
export function readStoredBudgetPlan(value: unknown): BudgetPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const totalUsd = Number(record.totalUsd);
  if (!Number.isFinite(totalUsd) || totalUsd < 0 || !Array.isArray(record.allocations)) return null;
  const allocations = record.allocations.flatMap((item): BudgetAllocation[] => {
    if (!item || typeof item !== "object") return [];
    const { option, usd, why } = item as Record<string, unknown>;
    const amount = Number(usd);
    return typeof option === "string" && Number.isFinite(amount) && amount >= 0
      ? [{ option, usd: amount, why: typeof why === "string" ? why.slice(0, 200) : "" }] : [];
  });
  const dice = record.dice && typeof record.dice === "object" && !Array.isArray(record.dice)
    ? Object.fromEntries(Object.entries(record.dice as Record<string, unknown>).filter(([, share]) => Number.isFinite(Number(share)))
      .map(([id, share]) => [id, Number(share)])) : {};
  return {
    at: typeof record.at === "string" ? record.at : "", totalUsd, dice, allocations,
    note: typeof record.note === "string" ? record.note.slice(0, 300) : "", by: record.by === "dice" ? "dice" : "agent",
    error: typeof record.error === "string" ? record.error.slice(0, 300) : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// One search's budget

/**
 * What the search of `search` gets now: its options' amounts, plus its share of the money the day's finished
 * searches did not use (in proportion to the planned amounts of the searches still to run), and of that the part for
 * the layoff method. `spent`: each search's spend so far (counts signal_cost_<id>); `done`: searches that ran their
 * course, gave up or were skipped.
 */
export function searchBudgetNow(args: {
  plan: BudgetPlan; options: readonly BudgetOption[]; search: string; spent: Readonly<Record<string, number>>; done: ReadonlySet<string>;
}): { usd: number; layoffUsd: number } {
  const planned = new Map<string, { signal: number; layoff: number }>();
  for (const option of args.options) {
    const usd = args.plan.allocations.find((item) => item.option === option.id)?.usd ?? 0;
    const entry = planned.get(option.search) ?? { signal: 0, layoff: 0 };
    entry[option.part] += usd;
    planned.set(option.search, entry);
  }
  const total = (search: string) => (planned.get(search)?.signal ?? 0) + (planned.get(search)?.layoff ?? 0);
  const own = total(args.search);
  if (own <= 0) return { usd: 0, layoffUsd: 0 };
  const finished = [...planned.keys()].filter((search) => args.done.has(search) && search !== args.search);
  const unused = Math.max(0, finished.reduce((sum, search) => sum + total(search) - Math.max(0, args.spent[search] ?? 0), 0));
  const waiting = [...planned.keys()].filter((search) => !args.done.has(search) || search === args.search)
    .reduce((sum, search) => sum + total(search), 0);
  const usd = cents(own + (waiting > 0 ? unused * (own / waiting) : 0));
  const layoffUsd = cents(usd * ((planned.get(args.search)?.layoff ?? 0) / own));
  return { usd, layoffUsd };
}
