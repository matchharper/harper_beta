import dynamic from "next/dynamic";
import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";

const OrgPersonalSettingsPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgPersonalSettingsPage").then(
      (module) => module.OrgPersonalSettingsPage
    ),
  { loading: () => <OrgPageLoading page="personal-settings" /> }
);

export default function OrgPersonalSettingsRoute() {
  return (
    <OrgWorkspaceApp page="personal-settings">
      <OrgPersonalSettingsPage />
    </OrgWorkspaceApp>
  );
}
