import "server-only";

import { getExaClient } from "@/lib/tools/exaClient";
import { gtmStructuredCall } from "../llm.server";
import { measured } from "./compose.server";
import {
  PROFILE_PAGE_CHARS, readProfileWith,
  type ProfileRead, type ProfileReadDeps, type ProfileReadPerson,
} from "./profileRead";

/**
 * #5 프로필 읽기 against Exa and the model (agent/profileRead.ts has the rules and the read): the person's own pages in
 * one Exa contents call (no login, no other scraping) and one model call over them.
 */

type ExaReply = { results?: Array<{ url?: string; title?: string | null; text?: string | null }>; costDollars?: { total?: number } };

const reported = (reply: ExaReply, fallback: number) => {
  const total = reply.costDollars?.total;
  return typeof total === "number" && Number.isFinite(total) ? total : fallback;
};

export const LIVE_PROFILE_DEPS: ProfileReadDeps = {
  contents: async (urls) => {
    const reply = await (getExaClient() as unknown as {
      getContents: (urls: string[], options: Record<string, unknown>) => Promise<ExaReply>;
    }).getContents(urls, { text: { maxCharacters: PROFILE_PAGE_CHARS } });
    return { pages: reply.results ?? [], costUsd: reported(reply, 0.001 * urls.length) };
  },
  model: (label, schema, prompt, maxTokens) => measured(`profile_${label}`, () => gtmStructuredCall({
    label: `gtm-agent:profile-${label}`, schemaName: `gtm_agent_profile_${label}`, schema, system: prompt.system, user: prompt.user, maxTokens,
    signal: AbortSignal.timeout(45_000),
  })),
};

/** Reads the person's own pages once; never throws, writes nothing. */
export function readPersonProfile(person: ProfileReadPerson, deps: ProfileReadDeps = LIVE_PROFILE_DEPS): Promise<ProfileRead> {
  return readProfileWith(person, deps);
}
