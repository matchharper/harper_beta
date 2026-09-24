import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgOnboardingPage } from "@/components/org/onboarding/OrgOnboardingPage";

export default function CompanyOnboarding() {
  return (
    <OrgWorkspaceApp page="onboarding">
      <OrgOnboardingPage />
    </OrgWorkspaceApp>
  );
}
