import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { PushNavigationFrame } from "@/components/ui/push-navigation";
import { useIsMobile } from "@/hooks/useMediaQuery";

type OrgMobileNavigationContextValue = {
  closeNavigation: () => void;
  navigationOpen: boolean;
  navigationTriggerHidden: boolean;
  openNavigation: () => void;
  setNavigationOpen: (open: boolean) => void;
  setNavigationTriggerHidden: (hidden: boolean) => void;
};

const OrgMobileNavigationContext =
  createContext<OrgMobileNavigationContextValue | null>(null);

export function OrgMobileNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [navigationTriggerHidden, setNavigationTriggerHidden] = useState(false);
  const isMobile = useIsMobile();
  const value = useMemo<OrgMobileNavigationContextValue>(
    () => ({
      closeNavigation: () => setNavigationOpen(false),
      navigationOpen: isMobile && navigationOpen,
      navigationTriggerHidden,
      openNavigation: () => setNavigationOpen(true),
      setNavigationOpen,
      setNavigationTriggerHidden,
    }),
    [isMobile, navigationOpen, navigationTriggerHidden]
  );

  return (
    <OrgMobileNavigationContext.Provider value={value}>
      <PushNavigationFrame
        className="h-svh md:contents"
        surfaceClassName="md:contents"
        open={value.navigationOpen}
        onOpenChange={setNavigationOpen}
      >
        {children}
      </PushNavigationFrame>
    </OrgMobileNavigationContext.Provider>
  );
}

export function useOrgMobileNavigation() {
  const context = useContext(OrgMobileNavigationContext);
  if (!context) {
    throw new Error(
      "useOrgMobileNavigation must be used within OrgMobileNavigationProvider"
    );
  }
  return context;
}
