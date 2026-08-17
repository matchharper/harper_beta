import { useRouter } from "next/router";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const PreviousPathnameContext = createContext<string | null>(null);

export function RouteHistoryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [previousPathname, setPreviousPathname] = useState<string | null>(null);

  useEffect(() => {
    const rememberCurrentPathname = () => {
      setPreviousPathname(router.pathname);
    };

    router.events.on("routeChangeStart", rememberCurrentPathname);
    return () => {
      router.events.off("routeChangeStart", rememberCurrentPathname);
    };
  }, [router.events, router.pathname]);

  return (
    <PreviousPathnameContext.Provider value={previousPathname}>
      {children}
    </PreviousPathnameContext.Provider>
  );
}

export function usePreviousPathname() {
  return useContext(PreviousPathnameContext);
}
