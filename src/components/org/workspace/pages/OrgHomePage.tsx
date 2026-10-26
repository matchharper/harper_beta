import { OrgJobsProvider } from "@/hooks/org/useOrgJobs";
import { OrgHomeInbox } from "@/components/org/OrgHomeInbox";

export function OrgHomePage() {
  return (
    <OrgJobsProvider routePage="home">
      <OrgHomeInbox />
    </OrgJobsProvider>
  );
}
