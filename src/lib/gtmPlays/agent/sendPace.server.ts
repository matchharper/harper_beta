import "server-only";

import { countAgentMailsToday } from "./send.server";
import {
  hoursFromSignal, nextOpenTick, paceForTick, planSends, remainingOpenTicks, sendWindowOpen, signalDelayLabel,
  type SendWindow,
} from "./sendTiming";
import { listAgentSendQueue, readAgentPerson } from "./store.server";
import type { AgentPerson, AgentSettings } from "./types";

/**
 * #5 send timing for a dispatcher tick (rules in agent/sendTiming.ts): whether the window is open, how many mails this
 * tick may send (shared by first mails and follow-ups), and which approved people go now.
 */

/** At most this many in one tick by the 24-hour rule (the pace still counts them). */
const DUE_MAX = 20;
/** How many waiting people one tick looks at (ids and signal times only). */
const QUEUE_LOOKAHEAD = 1_000;

export const sendWindowOf = (settings: AgentSettings): SendWindow => ({
  startHour: settings.sendStartHour, endHour: settings.sendEndHour, weekdays: settings.sendWeekdays,
});

/** A chosen Korea-time weekday, within the hours. */
export const sendWindowNow = (settings: AgentSettings, now: Date) => sendWindowOpen(now, sendWindowOf(settings));

/** This tick's mails: `left` by the pace, `quota` left of today's cap. */
export type TickMailBudget = { left: number; quota: number };

// One budget per tick: first mails and follow-ups get the same `now` from runAgentTick, so they share it.
const budgets = new WeakMap<Date, TickMailBudget>();

export async function tickMailBudget(settings: AgentSettings, now: Date): Promise<TickMailBudget> {
  const known = budgets.get(now);
  if (known) return known;
  const quota = Math.max(0, settings.dailyMailCap - await countAgentMailsToday(now));
  const budget = { left: paceForTick({ quotaLeft: quota, ticksLeft: remainingOpenTicks(now, sendWindowOf(settings)) }), quota };
  budgets.set(now, budget);
  return budget;
}

/** One mail went out this tick. */
export function spendTickMail(budget: TickMailBudget) {
  budget.left = Math.max(0, budget.left - 1);
  budget.quota = Math.max(0, budget.quota - 1);
}

/**
 * The approved people to send to in this tick, in order (newest signal first; the 24-hour rule's first, over the
 * pace): none when the window is closed or today's cap is used up. `max`: paced mails in one tick at most.
 */
export async function mailsToSendNow(settings: AgentSettings, now: Date, max: number): Promise<Array<{ person: AgentPerson; due: boolean }>> {
  const window = sendWindowOf(settings);
  if (!sendWindowOpen(now, window)) return [];
  const budget = await tickMailBudget(settings, now);
  if (budget.quota <= 0) return [];
  const plan = planSends(await listAgentSendQueue(QUEUE_LOOKAHEAD), {
    now, nextOpen: nextOpenTick(now, window), pace: Math.min(budget.left, budget.quota), max,
    dueMax: Math.min(DUE_MAX, budget.quota),
  });
  const people: Array<{ person: AgentPerson; due: boolean }> = [];
  for (const item of plan) {
    const person = await readAgentPerson(item.person.id);
    if (person?.status === "approved") people.push({ person, due: item.due });
  }
  return people;
}

/** The sent line's timing: how long after the signal, and whether the 24-hour rule sent it ahead of the pace. */
export function sentTimingNote(person: Pick<AgentPerson, "signalAt">, sentAt: string, due: boolean): string {
  const hours = hoursFromSignal(person.signalAt, sentAt);
  if (hours === null) return "";
  return ` · 신호 뒤 ${signalDelayLabel(hours)}${due ? " (24시간 지나기 전에 먼저 보냄)" : ""}`;
}
