import { useCountryLang } from "@/hooks/useCountryLang";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CAREER_LANDING_LOCAL_ID_STORAGE_KEY } from "@/lib/career/utm";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/router";
import { useEffect, useRef } from "react";

const PUBLIC_PAGE_VISIT_ABTEST_TYPE = "public_page_visit_v1";
const PUBLIC_PAGE_VISIT_TYPE_PREFIX = "page_visit:";

function createPublicPageVisitorId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function resolvePublicPageVisitorId() {
  try {
    const savedId = localStorage.getItem(
      CAREER_LANDING_LOCAL_ID_STORAGE_KEY
    );
    if (savedId) return savedId;

    const visitorId = createPublicPageVisitorId();
    localStorage.setItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY, visitorId);
    return visitorId;
  } catch {
    return createPublicPageVisitorId();
  }
}

export function usePublicPageVisitLog() {
  const router = useRouter();
  const countryLang = useCountryLang();
  const isMobile = useIsMobile();
  const loggedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    const pagePath = String(router.pathname ?? "").trim();
    if (!pagePath || loggedPathRef.current === pagePath) return;
    loggedPathRef.current = pagePath;

    const localId = resolvePublicPageVisitorId();

    void (async () => {
      try {
        const { error } = await supabase.from("landing_logs").insert({
          local_id: localId,
          type: `${PUBLIC_PAGE_VISIT_TYPE_PREFIX}${pagePath}`,
          abtest_type: PUBLIC_PAGE_VISIT_ABTEST_TYPE,
          is_mobile: isMobile,
          country_lang: countryLang,
        });

        if (error) {
          console.error("public page visit log insert error:", error);
        }
      } catch (error) {
        console.error("public page visit log insert error:", error);
      }
    })();
  }, [countryLang, isMobile, router.isReady, router.pathname]);
}
