import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import {
  CAREER_EMAIL_ONBOARDING_VARIANT,
  CAREER_WEB_ONBOARDING_VARIANT,
} from "@/lib/careerEmailOnboarding/constants";
import {
  getCareerSignupFlowAbtestType,
  resolveCareerOnboardingLandingVariant,
  type CareerOnboardingLandingVariant,
} from "@/lib/careerEmailOnboarding/experiment";
import { CAREER_LANDING_LOCAL_ID_STORAGE_KEY } from "@/lib/career/utm";

type CareerSignupFlowExperimentState = {
  abtestType: string;
  localId: string;
  ready: boolean;
  variant: CareerOnboardingLandingVariant;
};

const createCareerLandingId = () => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function getQueryText(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function useCareerSignupFlowExperiment(): CareerSignupFlowExperimentState {
  const router = useRouter();
  const override = useMemo(
    () => getQueryText(router.query.signup_flow).trim().toLowerCase(),
    [router.query.signup_flow]
  );
  const [state, setState] = useState<CareerSignupFlowExperimentState>(() => {
    const variant = CAREER_WEB_ONBOARDING_VARIANT;
    return {
      abtestType: getCareerSignupFlowAbtestType(variant),
      localId: "",
      ready: false,
      variant,
    };
  });

  useEffect(() => {
    if (!router.isReady || typeof window === "undefined") return;

    const savedId = localStorage.getItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY);
    const localId = savedId || createCareerLandingId();
    if (!savedId) {
      localStorage.setItem(CAREER_LANDING_LOCAL_ID_STORAGE_KEY, localId);
    }

    const variant = resolveCareerOnboardingLandingVariant({
      localId,
      override,
    });
    queueMicrotask(() => {
      setState({
        abtestType: getCareerSignupFlowAbtestType(variant),
        localId,
        ready: true,
        variant,
      });
    });
  }, [override, router.isReady]);

  return state;
}

export function isCareerEmailFirstVariant(
  variant: CareerOnboardingLandingVariant
) {
  return variant === CAREER_EMAIL_ONBOARDING_VARIANT;
}
