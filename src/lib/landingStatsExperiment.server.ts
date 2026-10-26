import type { GetServerSidePropsContext } from "next";
import {
  LANDING_STATS_COOKIE,
  parseLandingStatsVariant,
  type LandingStatsVariant,
} from "./landingStatsExperiment";

export function assignLandingStatsVariant({
  req,
  res,
  query,
}: Pick<
  GetServerSidePropsContext,
  "req" | "res" | "query"
>): LandingStatsVariant {
  const preview =
    process.env.NODE_ENV !== "production"
      ? parseLandingStatsVariant(query.landing_stats)
      : null;
  const existing = parseLandingStatsVariant(req.cookies[LANDING_STATS_COOKIE]);
  const variant = preview ?? existing ?? (globalThis.crypto.getRandomValues(new Uint8Array(1))[0] % 2 === 0 ? "A" : "B");
  res.setHeader("Cache-Control", "private, no-store");
  if (existing !== variant) {
    const prior = res.getHeader("Set-Cookie");
    const cookies = prior
      ? Array.isArray(prior)
        ? prior.map(String)
        : [String(prior)]
      : [];
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", [
      ...cookies,
      `${LANDING_STATS_COOKIE}=${variant}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
    ]);
  }
  return variant;
}
