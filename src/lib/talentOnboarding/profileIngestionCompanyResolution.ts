import {
  resolveTalentExperienceCompanies,
  type TalentExperienceCompanyResolutionInput,
  type TalentExperienceCompanyResolutionResult,
} from "@/lib/talentOnboarding/companyResolution";
import { logger } from "@/utils/logger";

type ResumeCompanyResolutionRunner = <
  T extends TalentExperienceCompanyResolutionInput,
>(args: {
  admin: any;
  experiences: readonly T[];
}) => Promise<TalentExperienceCompanyResolutionResult<T>>;

export async function resolveResumeExperienceCompaniesSafely<
  T extends TalentExperienceCompanyResolutionInput,
>(args: {
  admin: any;
  experiences: T[];
  hasResumeText: boolean;
  resolveCompanies?: ResumeCompanyResolutionRunner;
}): Promise<T[]> {
  if (!args.hasResumeText) {
    logger.log(
      "[TalentIngest] company resolution skipped for LinkedIn-only ingestion"
    );
    return args.experiences;
  }

  try {
    const resolution = await (
      args.resolveCompanies ?? resolveTalentExperienceCompanies
    )({
      admin: args.admin,
      experiences: args.experiences,
    });
    logger.log(
      "[TalentIngest] company resolution finished",
      resolution.summary
    );
    return resolution.experiences;
  } catch (error) {
    logger.log("[TalentIngest] company resolution failed open", {
      error: error instanceof Error ? error.message : String(error),
    });
    return args.experiences;
  }
}
