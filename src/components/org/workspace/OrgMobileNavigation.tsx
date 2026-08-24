import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";

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
  const value = useMemo<OrgMobileNavigationContextValue>(
    () => ({
      closeNavigation: () => setNavigationOpen(false),
      navigationOpen,
      navigationTriggerHidden,
      openNavigation: () => setNavigationOpen(true),
      setNavigationOpen,
      setNavigationTriggerHidden,
    }),
    [navigationOpen, navigationTriggerHidden]
  );

  return (
    <OrgMobileNavigationContext.Provider value={value}>
      {children}
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
