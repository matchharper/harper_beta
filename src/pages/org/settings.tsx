import { OrgWorkspaceApp } from "@/components/org/workspace/OrgWorkspaceApp";
import dynamic from "next/dynamic";
import { OrgPageLoading } from "@/components/org/workspace/OrgPageLoading";
const OrgSettingsPage = dynamic(
  () =>
    import("@/components/org/workspace/pages/OrgSettingsPage").then(
      (module) => module.OrgSettingsPage
    ),
  { loading: () => <OrgPageLoading page="settings" /> }
);

export default function OrgSettingsRoute() {
  return (
    <OrgWorkspaceApp page="settings">
      <OrgSettingsPage />
    </OrgWorkspaceApp>
  );
}
