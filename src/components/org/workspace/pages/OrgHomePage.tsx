import { OrgJobsProvider } from "@/hooks/org/useOrgJobs";
import { OrgHomeScreen } from "@/components/org/home-screen/OrgHomeScreen";

export function OrgHomePage() {
  return (
    <OrgJobsProvider routePage="home">
      <OrgHomeScreen />
    </OrgJobsProvider>
  );
}
