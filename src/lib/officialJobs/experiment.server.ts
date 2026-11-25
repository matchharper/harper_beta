import { randomInt } from "node:crypto";
import type { GetServerSidePropsContext } from "next";
import {
  OFFICIAL_JOBS_LAYOUT_COOKIE,
  parseOfficialJobsLayoutVariant,
  type OfficialJobsLayoutVariant,
} from "./experiment";
import {
  OFFICIAL_JOBS_ONESCREEN_COOKIE,
  type OfficialJobsOneScreenArm,
} from "./oneScreen";

type ExperimentContext = Pick<
  GetServerSidePropsContext,
  "req" | "res" | "query"
>;

/** A browser's arm of a two-arm job-page experiment, kept in a cookie for a year. */
function assignTwoArmCookie({
  context: { req, res, query },
  cookie,
  previewParam,
  initialArm,
}: {
  context: ExperimentContext;
  cookie: string;
  previewParam: string;
  /** The arm for a browser without the cookie yet; random when absent. Never changes an existing arm. */
  initialArm?: "A" | "B";
}): "A" | "B" {
  // Local previews persist across navigation; production ignores overrides.
  const preview =
    process.env.NODE_ENV !== "production"
      ? parseOfficialJobsLayoutVariant(query[previewParam])
      : null;
  const existing = parseOfficialJobsLayoutVariant(req.cookies[cookie]);
  const variant =
    preview ?? existing ?? initialArm ?? (randomInt(2) === 0 ? "A" : "B");
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
      `${cookie}=${variant}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
    ]);
  }
  return variant;
}

export function assignOfficialJobsLayoutVariant(
  context: ExperimentContext
): OfficialJobsLayoutVariant {
  return assignTwoArmCookie({
    context,
    cookie: OFFICIAL_JOBS_LAYOUT_COOKIE,
    previewParam: "jobs_layout",
  });
}

/**
 * Only for postings in the one-screen A/B; other postings never get this cookie.
 * `initialArm: "B"` is for a browser that opens the one screen's own URL
 * (?onescreen=1, shown only to arm B) without the cookie: arm B moving from the
 * LinkedIn app to Safari, or a copied link. An existing cookie still wins.
 */
export function assignOfficialJobsOneScreenArm(
  context: ExperimentContext,
  options?: { initialArm?: OfficialJobsOneScreenArm }
): OfficialJobsOneScreenArm {
  return assignTwoArmCookie({
    context,
    cookie: OFFICIAL_JOBS_ONESCREEN_COOKIE,
    previewParam: "jobs_onescreen",
    initialArm: options?.initialArm,
  });
}
