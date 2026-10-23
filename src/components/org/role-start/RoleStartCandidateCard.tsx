import { useState } from "react";
import { OrgRoleTalentBoardCard } from "@/components/org/OrgRoleTalentBoard";
import { CandidateRead } from "@/components/org/role-start/RoleStartCandidate";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import type { OrgBoardItem, OrgBoardProfileLabel } from "@/lib/org/server";
import type { RoleStartBriefView, RoleStartCandidateView } from "@/lib/org/roleStart/view";

/** Work history and education of one first-three person (GET /api/org/role-start profiles). */
export type FirstThreeProfile = {
  recentCompanies: OrgBoardProfileLabel[];
  recentSchools: OrgBoardProfileLabel[];
  experiences: Array<{ company: string | null; role: string | null; start: string | null; end: string | null; description: string | null }>;
};

/** The inbox card's shape for a person who is not in the inbox yet: no actions, no dates. */
function boardItemOf(candidate: RoleStartCandidateView, profile: FirstThreeProfile | undefined, roleId: string): OrgBoardItem {
  return {
    capabilities: { contactCandidate: false, moveStage: false, pass: false, requestIntro: false, scheduleInterview: false, viewResume: false },
    companyIntro: null,
    companyPresentedAt: null,
    criteriaEvaluations: (candidate.verdict?.criteria ?? []).map((item) => ({
      name: item.name,
      fitness: item.fitness,
      content: item.evidence,
    })),
    createdAt: "",
    fitReasons: [],
    fitSummary: null,
    recommendedAt: "",
    recommendationId: "",
    processClosureNoticeUnresolved: false,
    roleId,
    roleName: null,
    source: "recommendation",
    stage: "pending_connection",
    stageTag: null,
    talent: {
      email: null,
      headline: candidate.headline,
      location: candidate.location,
      name: candidate.name,
      profilePicture: null,
      recentCompanies: profile?.recentCompanies ?? [],
      recentSchools: profile?.recentSchools ?? [],
      userId: candidate.talentId,
    },
    talentId: candidate.talentId,
    upcomingMeeting: null,
    updatedAt: "",
  };
}

/**
 * A first-three person as the inbox shows candidates, and a read-only profile
 * on click (no contact details, no profile-view record). Temporary until it
 * merges into the shared candidate review screen (#14 3.2 item 3).
 */
export function RoleStartCandidateCard(props: {
  candidate: RoleStartCandidateView;
  criteria: RoleStartBriefView["criteria"];
  profile: FirstThreeProfile | undefined;
  roleId: string;
}) {
  const { c } = useOrgLocale();
  const [open, setOpen] = useState(false);
  const { candidate, profile } = props;
  return (
    <>
      <OrgRoleTalentBoardCard item={boardItemOf(candidate, profile, props.roleId)} onOpen={() => setOpen(true)} stages={[]} />
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent className="max-h-[calc(100svh-2rem)] max-w-[640px] overflow-y-auto">
          <DialogTitle className="text-[18px]">{candidate.name || c("이름 없음", "No name")}</DialogTitle>
          {candidate.headline || candidate.location ? (
            <p className="text-[13px] leading-5 text-neutral-muted">
              {[candidate.headline, candidate.location].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {profile?.experiences.length ? (
            <section className="mt-4 grid gap-3">
              <h4 className="text-[12px] font-normal text-neutral-soft">{c("경력", "Experience")}</h4>
              {profile.experiences.map((item, index) => (
                <div className="grid gap-0.5" key={index}>
                  <p className="text-[14px] text-neutral-primary">{[item.company, item.role].filter(Boolean).join(" · ")}</p>
                  {item.start || item.end ? (
                    <p className="text-[12px] text-neutral-soft">
                      {`${item.start ?? ""} – ${item.end ?? c("현재", "Present")}`}
                    </p>
                  ) : null}
                  {item.description ? (
                    <p className="whitespace-pre-wrap text-[13px] leading-5 text-neutral-muted">{item.description}</p>
                  ) : null}
                </div>
              ))}
            </section>
          ) : null}
          {profile?.recentSchools.length ? (
            <section className="mt-4 grid gap-2">
              <h4 className="text-[12px] font-normal text-neutral-soft">{c("학력", "Education")}</h4>
              {profile.recentSchools.map((item, index) => (
                <p className="text-[14px] text-neutral-primary" key={index}>
                  {[item.label, item.detail === item.label ? null : item.detail, item.period].filter(Boolean).join(" · ")}
                </p>
              ))}
            </section>
          ) : null}
          <CandidateRead candidate={candidate} criteria={props.criteria} />
        </DialogContent>
      </Dialog>
    </>
  );
}
