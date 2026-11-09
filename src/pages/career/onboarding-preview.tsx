import Head from "next/head";
import ErrorPage from "next/error";
import {
  CareerOnboardingGuideBody,
  CareerOnboardingGuideHeader,
} from "@/components/career/CareerOnboardingGuide";
import {
  OnboardingFooter,
  OnboardingFrame,
} from "@/components/common/onboarding/Onboarding";
import { useCareerT } from "@/i18n/useCareerT";
import { getCareerOnboardingStepOrder } from "@/lib/career/onboardingStepOrderExperiment";
import { canUseCareerDevControls } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";

export default function CareerOnboardingPreview() {
  const loading = useAuthStore((state) => state.loading);
  const email = useAuthStore((state) => state.user?.email);
  const t = useCareerT();
  const steps = getCareerOnboardingStepOrder();
  if (process.env.NODE_ENV === "production") {
    if (loading) return null;
    if (!canUseCareerDevControls(email)) return <ErrorPage statusCode={404} />;
  }
  return (
    <>
      <Head>
        <title>Career Onboarding Preview</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="career-onboarding min-h-svh font-sans text-neutral-primary">
        <OnboardingFrame
          expandContent
          progressStep={steps.indexOf("guide")}
          totalSteps={steps.length}
          title={<CareerOnboardingGuideHeader />}
          footer={
            <OnboardingFooter
              pending
              onNext={() => {}}
              nextLabel={t("career.onboarding.onboarding.0wbopf1", "다음")}
            />
          }
        >
          <CareerOnboardingGuideBody />
        </OnboardingFrame>
      </main>
    </>
  );
}
