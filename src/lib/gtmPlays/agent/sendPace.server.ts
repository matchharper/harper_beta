import "server-only";

import { byQueueOrder, channelOf, channelRoomLeft, type AgentChannelKey } from "./channels";
import { countAgentMailsToday } from "./send.server";
import {
  hoursFromSignal, nextOpenTick, paceForTick, planSends, remainingOpenTicks, sendWindowOpen, signalDelayLabel,
  type SendWindow,
} from "./sendTiming";
import { channelUseToday, listAgentSendQueue, readAgentPerson } from "./store.server";
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
 * Each channel's mails today (first mails and follow-ups), counted once per tick and kept up as the tick sends: how
 * many more a channel may send today (none while it is off; no limit but the shared cap for the existing channels).
 */
export type ChannelRoom = { left: (channel: AgentChannelKey) => number; spend: (channel: AgentChannelKey) => void };

const rooms = new WeakMap<Date, ChannelRoom>();

export async function channelRoomToday(settings: AgentSettings, now: Date): Promise<ChannelRoom> {
  const known = rooms.get(now);
  if (known) return known;
  const used = new Map((await channelUseToday(now)).sent);
  const room: ChannelRoom = {
    left: (channel) => channelRoomLeft(settings.channels[channel], used.get(channel) ?? 0),
    spend: (channel) => { used.set(channel, (used.get(channel) ?? 0) + 1); },
  };
  rooms.set(now, room);
  return room;
}

/** The person's channel (agent/channels.ts channelOf). */
export const personChannel = (person: Pick<AgentPerson, "source" | "method" | "intent" | "foundAs">) => channelOf(person);

/**
 * The approved people to send to in this tick, in the queue's order (agent/channels.ts: the existing channels' dated
 * people, the new channels' dated people, the applicant file, the DB; newest signal first in each; the 24-hour rule's
 * first, over the pace): none when the window is closed or today's cap is used up. A channel that is off or at its
 * daily max waits (at most its room is planned). `max`: paced mails in one tick at most.
 */
export async function mailsToSendNow(settings: AgentSettings, now: Date, max: number): Promise<Array<{ person: AgentPerson; due: boolean }>> {
  const window = sendWindowOf(settings);
  if (!sendWindowOpen(now, window)) return [];
  const budget = await tickMailBudget(settings, now);
  if (budget.quota <= 0) return [];
  const room = await channelRoomToday(settings, now);
  const queue = (await listAgentSendQueue(QUEUE_LOOKAHEAD)).sort(byQueueOrder);
  // At most each channel's room left today is planned (the plan never takes more than these, in this order).
  const planned = new Map<AgentChannelKey, number>();
  const open = queue.filter((person) => {
    const taken = planned.get(person.channel) ?? 0;
    if (taken >= room.left(person.channel)) return false;
    planned.set(person.channel, taken + 1);
    return true;
  });
  const plan = planSends(open, {
    now, nextOpen: nextOpenTick(now, window), pace: Math.min(budget.left, budget.quota), max,
    dueMax: Math.min(DUE_MAX, budget.quota), order: byQueueOrder,
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
