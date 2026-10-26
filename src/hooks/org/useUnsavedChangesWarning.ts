import { useRouter } from "next/router";
import { useEffect } from "react";
import { registerOrgUnsavedChangesGuard } from "@/lib/org/unsavedChangesGuard";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

export const ORG_UNSAVED_CHANGES_MESSAGE =
  "저장하지 않은 변경사항이 있습니다. 지금 이동하면 변경사항이 반영되지 않습니다. 그래도 이동할까요?";

export function useUnsavedChangesWarning(
  hasUnsavedChanges: boolean,
  { preserveWithinRole = false }: { preserveWithinRole?: boolean } = {}
) {
  const { c } = useOrgLocale();
  const router = useRouter();
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    return registerOrgUnsavedChangesGuard({
      router,
      preserveWithinRole,
      confirmNavigation: () =>
        window.confirm(
          c(
            ORG_UNSAVED_CHANGES_MESSAGE,
            "You have unsaved changes. Leave this page without saving?"
          )
        ),
    });
  }, [hasUnsavedChanges, preserveWithinRole, router, c]);
}
