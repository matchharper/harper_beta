import type { NextRouter } from "next/router";

type Guard = {
  router: NextRouter;
  preserveWithinRole: boolean;
  confirmNavigation: () => boolean;
};

// Visited Role panels stay mounted. They must share one navigation guard:
// independent beforePopState handlers replace each other and duplicate prompts.
const registrations = new WeakMap<
  NextRouter["events"],
  {
    guards: Set<Guard>;
    dispose: () => void;
    clearApproval: () => void;
  }
>();

export function registerOrgUnsavedChangesGuard(guard: Guard) {
  const { router } = guard;
  let registration = registrations.get(router.events);
  if (!registration) {
    const guards = new Set<Guard>();
    let approvedUrl: string | null = null;
    const clearApproval = () => {
      approvedUrl = null;
    };
    const href = (url: string) => new URL(url, window.location.origin).href;
    const first = () => guards.values().next().value!;
    const preservesDraft = (url: string) => {
      const next = new URL(url, window.location.origin);
      return [...guards].every((entry) => {
        const current = new URL(entry.router.asPath, window.location.origin);
        return (
          current.origin === next.origin &&
          ((current.pathname === next.pathname &&
            current.search === next.search) ||
            (entry.preserveWithinRole &&
              current.pathname === "/org/role" &&
              next.pathname === current.pathname &&
              ["orgId", "roleId"].every(
                (key) =>
                  current.searchParams.get(key) === next.searchParams.get(key)
              )))
        );
      });
    };
    const confirmNavigation = () => first().confirmNavigation();
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const handleLinkClick = (event: MouseEvent) => {
      clearApproval();
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      const link =
        target instanceof Element
          ? target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link || link.download || (link.target && link.target !== "_self"))
        return;
      const next = new URL(link.href, window.location.origin);
      if (next.origin !== window.location.origin || preservesDraft(next.href))
        return;
      // Cancel before Next starts replacing the page (and rejecting its Link promise).
      if (confirmNavigation()) approvedUrl = next.href;
      else {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const handleRouteChangeStart = (url: string) => {
      const approved = approvedUrl === href(url);
      clearApproval();
      if (approved || preservesDraft(url) || confirmNavigation()) return;
      const error = Object.assign(
        new Error("Route change aborted by unsaved changes"),
        {
          cancelled: true,
        }
      );
      router.events.emit("routeChangeError", error, url, { shallow: false });
      throw error;
    };
    const handlePopState = ({ as }: { as: string }) => {
      clearApproval();
      if (preservesDraft(as)) return true;
      const confirmed = confirmNavigation();
      if (confirmed) approvedUrl = href(as);
      return confirmed;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleLinkClick, true);
    router.beforePopState(handlePopState);
    router.events.on("routeChangeStart", handleRouteChangeStart);
    router.events.on("routeChangeComplete", clearApproval);
    router.events.on("routeChangeError", clearApproval);
    registration = {
      guards,
      clearApproval,
      dispose: () => {
        window.removeEventListener("beforeunload", handleBeforeUnload);
        document.removeEventListener("click", handleLinkClick, true);
        router.beforePopState(() => true);
        router.events.off("routeChangeStart", handleRouteChangeStart);
        router.events.off("routeChangeComplete", clearApproval);
        router.events.off("routeChangeError", clearApproval);
      },
    };
    registrations.set(router.events, registration);
  }
  registration.guards.add(guard);
  registration.clearApproval();
  const current = registration;
  return () => {
    current.guards.delete(guard);
    current.clearApproval();
    if (current.guards.size === 0) {
      current.dispose();
      registrations.delete(router.events);
    }
  };
}
