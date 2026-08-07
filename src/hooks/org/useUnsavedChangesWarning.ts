import { useRouter } from "next/router";
import { useEffect } from "react";

export const ORG_UNSAVED_CHANGES_MESSAGE =
  "저장하지 않은 변경사항이 있습니다. 지금 이동하면 변경사항이 반영되지 않습니다. 그래도 이동할까요?";

export function useUnsavedChangesWarning(hasUnsavedChanges: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    let skipNextRouteConfirmation = false;
    const confirmNavigation = () => window.confirm(ORG_UNSAVED_CHANGES_MESSAGE);
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleRouteChangeStart = (url: string) => {
      if (skipNextRouteConfirmation) {
        skipNextRouteConfirmation = false;
        return;
      }
      if (url === router.asPath || confirmNavigation()) return;

      const error = new Error("Route change aborted by unsaved changes");
      Object.assign(error, { cancelled: true });
      router.events.emit("routeChangeError", error, url, { shallow: false });
      throw error;
    };
    const handlePopState = () => {
      const confirmed = confirmNavigation();
      if (confirmed) skipNextRouteConfirmation = true;
      return confirmed;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    router.beforePopState(handlePopState);
    router.events.on("routeChangeStart", handleRouteChangeStart);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      router.beforePopState(() => true);
      router.events.off("routeChangeStart", handleRouteChangeStart);
    };
  }, [hasUnsavedChanges, router]);
}
