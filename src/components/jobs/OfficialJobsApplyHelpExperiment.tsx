import {
  OFFICIAL_JOBS_APPLY_HELP_BOOTSTRAP_SCRIPT,
  OFFICIAL_JOBS_APPLY_HELP_EXPERIMENT_CSS,
  OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ONLY_CLASS,
} from "@/lib/officialJobs/experiment";
import Head from "next/head";
import type { ReactNode } from "react";

export function OfficialJobsApplyHelpExperimentHead() {
  return (
    <Head>
      <style>{OFFICIAL_JOBS_APPLY_HELP_EXPERIMENT_CSS}</style>
      <script
        id="official-jobs-apply-help-experiment"
        dangerouslySetInnerHTML={{
          __html: OFFICIAL_JOBS_APPLY_HELP_BOOTSTRAP_SCRIPT,
        }}
      />
    </Head>
  );
}

export function OfficialJobsApplyHelpTreatmentOnly({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={OFFICIAL_JOBS_APPLY_HELP_TREATMENT_ONLY_CLASS}>
      {children}
    </div>
  );
}
