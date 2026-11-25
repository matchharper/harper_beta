/** The PC aside card's wrapper; Talk to Harper scrolls here where it is on screen (lg). */
export const OFFICIAL_JOBS_ONESCREEN_ANCHOR_ID = "harper-onescreen";

/** Sent on window when Talk to Harper scrolls to the PC card: the card opens its sign-up box. */
export const OFFICIAL_JOBS_ONESCREEN_OPEN_EVENT = "harper:onescreen-open-join";

export type OfficialJobsOneScreenHrefs = {
  /** ?onescreen=1: the one screen's page, on the sign-up and introduction form. */
  join: string;
  /** ?onescreen=1&mode=similar: the one screen's page, on the similar-postings form. */
  similar: string;
  /** The posting itself, without the one screen's params. */
  posting: string;
};

/**
 * The one screen's URLs for this posting. The rest of the current query (utm,
 * gtm, referral) is kept, so events and sign-up attribution still see it.
 */
export function buildOfficialJobsOneScreenHrefs(
  jobPath: string,
  asPath: string
): OfficialJobsOneScreenHrefs {
  const search = asPath.split("#")[0]?.split("?")[1] ?? "";
  const build = (set: Record<string, string>) => {
    const params = new URLSearchParams(search);
    params.delete("onescreen");
    params.delete("mode");
    for (const [key, value] of Object.entries(set)) params.set(key, value);
    const query = params.toString();
    return query ? `${jobPath}?${query}` : jobPath;
  };
  return {
    join: build({ onescreen: "1" }),
    similar: build({ onescreen: "1", mode: "similar" }),
    posting: build({}),
  };
}
