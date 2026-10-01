import { randomInt } from "node:crypto";
import type { GetServerSidePropsContext } from "next";
import {
  OFFICIAL_JOBS_LAYOUT_COOKIE,
  parseOfficialJobsLayoutVariant,
  type OfficialJobsLayoutVariant,
} from "./experiment";

export function assignOfficialJobsLayoutVariant({
  req,
  res,
  query,
}: Pick<
  GetServerSidePropsContext,
  "req" | "res" | "query"
>): OfficialJobsLayoutVariant {
  // Local previews persist across navigation; production ignores overrides.
  const preview =
    process.env.NODE_ENV !== "production"
      ? parseOfficialJobsLayoutVariant(query.jobs_layout)
      : null;
  const existing = parseOfficialJobsLayoutVariant(
    req.cookies[OFFICIAL_JOBS_LAYOUT_COOKIE]
  );
  const variant = preview ?? existing ?? (randomInt(2) === 0 ? "A" : "B");
  res.setHeader("Cache-Control", "private, no-store");
  if (variant !== existing) {
    const prior = res.getHeader("Set-Cookie");
    const cookies = prior
      ? Array.isArray(prior)
        ? prior.map(String)
        : [String(prior)]
      : [];
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    res.setHeader("Set-Cookie", [
      ...cookies,
      `${OFFICIAL_JOBS_LAYOUT_COOKIE}=${variant}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
    ]);
  }
  return variant;
}
