// pages/auth/callback.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/lib/supabase";
import { trackSignUp } from "@/lib/ga";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { finalizePendingTalentCapture } from "@/lib/talentCapture/client";
import { buildLandingLoginEmailType } from "@/lib/landingLogTypes";
import { getCareerSignupAttributionPayload } from "@/lib/career/signupAttribution";
import { CAREER_EMAIL_ONBOARDING_TOKEN_PARAM } from "@/lib/careerEmailOnboarding/constants";
import { getInitialClientLocalePreference } from "@/i18n/useMessage";

function inferLandingLogSource(args: { flow: string; nextPath: string }) {
  if (args.nextPath.startsWith("/search")) return "search";
  if (args.nextPath.startsWith("/career")) return "career";
  if (args.nextPath.startsWith("/find")) return "company";
  if (args.flow === "talent_capture") return "career";
  return null;
}

function getQueryText(value: string | string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function getNextPathParam(nextPath: string, key: string) {
  if (typeof window === "undefined") return "";

  try {
    return (
      new URL(nextPath, window.location.origin).searchParams.get(key)?.trim() ??
      ""
    );
  } catch {
    return "";
  }
}

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    (async () => {
      const lid = getQueryText(router.query.lid);
      const flow = getQueryText(router.query.flow);
      const rawNext =
        typeof router.query.next === "string" ? router.query.next : "";
      const fallbackNextPath =
        flow === "talent_capture" ? "/career" : "/invitation";
      const nextPath =
        rawNext.startsWith("/") && !rawNext.startsWith("//")
          ? rawNext
          : fallbackNextPath;
      const countryLang =
        typeof router.query.cl === "string" ? router.query.cl : null;
      const abtestType =
        typeof router.query.ab === "string" ? router.query.ab : null;
      const querySource =
        typeof router.query.src === "string"
          ? router.query.src
          : typeof router.query.source === "string"
            ? router.query.source
            : null;
      const inviteToken =
        getQueryText(router.query.invite) ||
        getNextPathParam(nextPath, "invite");
      const rawMail =
        getQueryText(router.query.mail) || getNextPathParam(nextPath, "mail");
      const emailOnboardingToken =
        getQueryText(router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]) ||
        getNextPathParam(nextPath, CAREER_EMAIL_ONBOARDING_TOKEN_PARAM);
      const mail = emailOnboardingToken ? "" : rawMail;
      const code =
        typeof router.query.code === "string" ? router.query.code : "";

      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.error("exchangeCodeForSession error:", exchangeError);
        }
      }

      // 1) 여기서 getSession() 호출하면, supabase-js가 URL에 붙은 code를 처리해서 세션을 잡는 경우가 많음
      await supabase.auth.getSession();

      // 2) 유저 정보 읽기
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user;

      if (userErr || !user) {
        router.replace("?error=no_user");
        return;
      }

      if (lid && user.email) {
        const landingLogSource =
          querySource || inferLandingLogSource({ flow, nextPath });
        const { error: loginLogError } = await supabase
          .from("landing_logs")
          .insert({
            local_id: lid,
            type: buildLandingLoginEmailType(user.email, landingLogSource),
            abtest_type: abtestType,
            is_mobile: null,
            country_lang: countryLang,
          });
        if (loginLogError) {
          console.error("login log insert error:", loginLogError);
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        router.replace("?error=no_session");
        return;
      }

      if (flow === "talent_capture") {
        const bootstrapRes = await fetch("/api/talent/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            ...getCareerSignupAttributionPayload({
              localId: lid,
              path: nextPath,
              source: querySource,
            }),
            ...(inviteToken ? { inviteToken } : {}),
            locale: getInitialClientLocalePreference(),
            ...(mail ? { mail } : {}),
            ...(emailOnboardingToken ? { emailOnboardingToken } : {}),
          }),
        });

        const bootstrapJson = await bootstrapRes.json().catch(() => ({}));
        if (!bootstrapRes.ok) {
          console.error("talent bootstrap error:", bootstrapJson);
          router.replace("?error=talent_profile_upsert_failed");
          return;
        }
        if (bootstrapJson?.created === true) {
          trackSignUp({
            flow: "talent_capture",
            method: "auth_callback",
          });
        }

        try {
          await finalizePendingTalentCapture(accessToken);
        } catch (captureError) {
          console.error("talent capture save error:", captureError);
          router.replace("/career?captureError=1");
          return;
        }

        router.replace(nextPath);
        return;
      }

      const bootstrapRes = await fetch("/api/auth/bootstrap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const bootstrapJson = await bootstrapRes.json().catch(() => ({}));
      if (!bootstrapRes.ok) {
        console.error("bootstrap error:", bootstrapJson);
        router.replace("?error=profile_upsert_failed");
        return;
      }
      if (bootstrapJson?.created === true) {
        trackSignUp({
          flow: "company",
          method: "auth_callback",
        });
      }

      await useCompanyUserStore.getState().load(user.id);

      // 4) 완료 후 이동
      router.replace(nextPath);
    })();
  }, [router]);

  return null;
}
