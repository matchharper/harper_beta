import { useEffect, useRef } from "react";
import {
  getLandingStatsAbtestType,
  LANDING_STATS_EXPOSURE,
  type LandingStatsVariant,
} from "@/lib/landingStatsExperiment";
import { supabase } from "@/lib/supabase";

export function useLandingStatsExperiment({
  variant,
  localId,
  enabled,
  isMobile,
  countryLang,
}: {
  variant: LandingStatsVariant;
  localId: string;
  enabled: boolean;
  isMobile: boolean;
  countryLang: string;
}) {
  const logged = useRef("");
  useEffect(() => {
    // Local previews must not enroll QA browsers in the production experiment.
    if (process.env.NODE_ENV !== "production" || !enabled || !localId) return;
    const key = `${localId}:${variant}`;
    if (logged.current === key) return;
    logged.current = key;
    // Enroll both arms on landing, independently of scrolling or stats loading.
    void (async () => {
      try {
        const { error } = await supabase.from("landing_logs").insert({
          local_id: localId,
          abtest_type: getLandingStatsAbtestType(variant),
          type: LANDING_STATS_EXPOSURE,
          is_mobile: isMobile,
          country_lang: countryLang,
        });
        if (error) throw error;
      } catch (error) {
        logged.current = "";
        console.error("landing stats exposure failed:", error);
      }
    })();
  }, [countryLang, enabled, isMobile, localId, variant]);
}
