import "server-only";

import { gtmRead } from "../db.server";
import { kstDayWindow } from "../sendLimit";
import { agentAlert } from "./alerts.server";
import type { AgentPerson } from "./types";
import {
  VENDOR_MAX_USD, VENDOR_TOOLS, readVendorAnswer, vendorAddressProblem, vendorAsks, vendorProfileUrl,
  type VendorAnswer, type VendorAsk, type VendorAskResult,
} from "./vendorEmail";

/**
 * treg on the server (rules in agent/vendorEmail.ts): the key, the calls and today's count. The key is the team's
 * token from treg (Vercel TREG_API_KEY; TREG_TOKEN, treg's own name for it, works too). Without one treg is never
 * asked and the run excludes people as before.
 */
export function vendorToken(): string | null {
  return process.env.TREG_API_KEY?.trim() || process.env.TREG_TOKEN?.trim() || null;
}

const TREG_CALL_URL = "https://treg.to/call/";
/**
 * One ask's wait. treg polls a slow vendor for up to 60 s (then answers 202) and checks the mailbox after, so an ask
 * gets this long. An ask starts only with this plus TREG_END_MARGIN_MS left in the tick (the route stops at 300 s);
 * otherwise the person waits for the next tick (askVendor "deferred").
 */
export const TREG_TIMEOUT_MS = 75_000;
/** What an ask leaves for the rest of the tick after its longest wait (the person's update, the tick's own end). */
export const TREG_END_MARGIN_MS = 30_000;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * treg gave no answer yet: a timeout or a dropped connection (the vendor may have answered and been paid), 409 (the same
 * ask still running), 429 (busy or rate-limited), 5xx. The person is tried again later (run.server.ts handlePeople) with
 * the same Idempotency-Key, and treg hands back a stored answer at no cost with its first charge
 * (X-Treg-Original-Cost-Micro).
 */
export class VendorRetry extends Error {}

/** treg refuses every ask until tomorrow (00:00 UTC): its free trial pool or the team member's daily spend limit. */
const STOP_FOR_TODAY = /trial_allowance_reached|member_spend_cap_reached/;

type TregAnswer = VendorAnswer & {
  /** treg's status when it gave no answer (not 200); null otherwise. */
  httpStatus: number | null;
  /**
   * Every ask fails the same way until someone acts: the key or the balance (401, 402 other than the ceiling, 403), or
   * today's trial pool or spend limit (429 STOP_FOR_TODAY).
   */
  keyProblem: boolean;
};

/**
 * One ask (treg's guide, treg.to/skill.md): the profile only, the mailbox check in the same call, a ceiling on what it
 * may cost, and an Idempotency-Key, so that asking again about the same person never pays twice (for 24 hours treg
 * hands back the stored answer at cost 0). No answer yet throws VendorRetry. Any other status is an ask without an
 * address.
 */
async function askTreg(ask: VendorAsk, linkedinUrl: string, token: string, personId: string): Promise<TregAnswer> {
  let response: Response;
  try {
    response = await fetch(`${TREG_CALL_URL}${VENDOR_TOOLS[ask]}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Treg-Token": token,
        "X-Treg-Route-Verify": "true",
        "X-Treg-Route-Max-Cost": String(VENDOR_MAX_USD[ask]),
        "Idempotency-Key": `harper-gtm-agent-${personId}-${ask}`,
      },
      body: JSON.stringify({ linkedin_url: linkedinUrl }),
      signal: AbortSignal.timeout(TREG_TIMEOUT_MS),
    });
  } catch (error) {
    throw new VendorRetry(`treg에 닿지 못했어요 (${ask}) · ${errorText(error)}`);
  }
  const text = await response.text().catch(() => "");
  const stopForToday = response.status === 429 && STOP_FOR_TODAY.test(text);
  if (!stopForToday && (response.status === 409 || response.status === 429 || response.status >= 500)) {
    throw new VendorRetry(`treg가 잠시 답하지 못했어요 (${response.status}, ${ask}) · ${text.slice(0, 160)}`);
  }
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON: no address in it.
  }
  const httpStatus = response.status === 200 ? null : response.status;
  if (httpStatus) console.error("[gtm-agent] treg gave no answer", httpStatus, ask, text.slice(0, 300));
  const header = (name: string) => response.headers.get(name);
  return {
    ...readVendorAnswer(response.status, body, {
      costMicro: header("x-treg-cost-micro"), originalCostMicro: header("x-treg-original-cost-micro"),
      replayed: header("x-treg-idempotent-replay")?.trim().toLowerCase() === "true", servedBy: header("x-treg-served-by"),
    }),
    httpStatus,
    // 402 route_max_cost is the ceiling (VENDOR_MAX_USD), not the balance.
    keyProblem: stopForToday || ((httpStatus === 401 || httpStatus === 402 || httpStatus === 403) && !text.includes("route_max_cost")),
  };
}

/** Addresses from treg used today (Korea time), test rows left out: the daily max is checked against it. */
export async function vendorAddressesToday(now = new Date()): Promise<number> {
  const day = kstDayWindow(now);
  const [row] = await gtmRead((sql) => sql<Array<{ n: number }>>`
    select count(*)::int as n from public.gtm_agent_people
    where email_source = 'vendor' and not is_test
      and (email_lookup -> 'vendor' ->> 'at')::timestamptz >= ${day.start}::timestamptz
      and (email_lookup -> 'vendor' ->> 'at')::timestamptz < ${day.end}::timestamptz
  `);
  return Number(row?.n ?? 0);
}

/** What asking treg about one person came to (askVendor). */
export type VendorAsked =
  /** Every ask was answered (or treg refused them all): the address used, if any. */
  | { kind: "asked"; email: string | null; asks: VendorAskResult[] }
  /** No time left in this tick for the next ask: nothing is kept, the next tick asks again (answered asks replay). */
  | { kind: "deferred" }
  /** An ask got no answer yet (VendorRetry): the asks answered before it, and the error. */
  | { kind: "retry"; asks: VendorAskResult[]; error: VendorRetry };

/**
 * treg for one person: the asks in order (vendorAsks) until one gives an address the agent may use. `msLeft`: the time
 * left in the tick. Nothing is logged or written here: the run writes the person, then logs the cost (a retry's
 * replays carry their first charges, so it is logged once either way).
 */
export async function askVendor(
  person: AgentPerson, workAddresses: boolean, token: string, msLeft: () => number,
): Promise<VendorAsked> {
  const url = vendorProfileUrl(person);
  const asks: VendorAskResult[] = [];
  for (const ask of url ? vendorAsks(person, workAddresses) : []) {
    if (msLeft() < TREG_TIMEOUT_MS + TREG_END_MARGIN_MS) return { kind: "deferred" };
    let answer: TregAnswer;
    try {
      answer = await askTreg(ask, url as string, token, person.id);
    } catch (error) {
      if (error instanceof VendorRetry) return { kind: "retry", asks, error };
      throw error;
    }
    // A 404 reads as nothing found (a vendor's own "no such person"); any other status without an answer is a failed ask.
    const reason = answer.httpStatus && answer.httpStatus !== 404 ? "failed" : vendorAddressProblem(answer, person, workAddresses);
    asks.push({
      ask, verdict: answer.verdict, servedBy: answer.servedBy, costUsd: answer.costUsd, reason,
      ...(answer.httpStatus ? { httpStatus: answer.httpStatus } : {}),
    });
    if (answer.keyProblem) {
      // Every ask fails until someone fixes it, so Ops hears of it (alerts.ts: twice a day at most).
      await agentAlert("vendor_refused", `treg가 ${answer.httpStatus}로 거절했어요. treg 키(Vercel TREG_API_KEY)와 잔액·한도를 확인해 주세요.`);
      break;
    }
    if (!reason) return { kind: "asked", email: answer.email, asks };
  }
  return { kind: "asked", email: null, asks };
}
