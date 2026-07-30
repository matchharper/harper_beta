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
import {
  isTalentAccountEmailChangeExpiredError,
  isTalentAccountEmailChangePendingConfirmation,
  isTalentAccountEmailUnavailableError,
} from "@/lib/career/accountEmailErrors";
import {
  inferCompanyAuthEntrySource,
  isTalentAuthDestination,
  resolveAuthCallbackDestination,
  resolveAuthCallbackErrorDestination,
} from "@/lib/authPersona";

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

function getAuthCallbackHashValue(key: string) {
  if (typeof window === "undefined") return "";

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get(key)?.trim() ?? "";
}

function getAuthCallbackHashError() {
  return (
    getAuthCallbackHashValue("error_description") ||
    getAuthCallbackHashValue("error_code") ||
    getAuthCallbackHashValue("error")
  );
}

function withEmailChangeResult(
  nextPath: string,
  result: "complete" | "error" | "expired" | "pending" | "unavailable"
) {
  if (typeof window === "undefined") return nextPath;

  const nextUrl = new URL(nextPath, window.location.origin);
  nextUrl.searchParams.set("emailChange", result);
  return `${nextUrl.pathname}${nextUrl.search}`;
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
      const querySource =
        getQueryText(router.query.src) ||
        getQueryText(router.query.source) ||
        getNextPathParam(rawNext, "source") ||
        null;
      const emailOnboardingToken =
        getQueryText(router.query[CAREER_EMAIL_ONBOARDING_TOKEN_PARAM]) ||
        getNextPathParam(rawNext, CAREER_EMAIL_ONBOARDING_TOKEN_PARAM);
      const nextPath = resolveAuthCallbackDestination({
        flow,
        rawNext,
        source: querySource,
        emailOnboardingToken,
      });
      const isTalentDestination = isTalentAuthDestination({
        flow,
        nextPath,
      });
      const countryLang =
        typeof router.query.cl === "string" ? router.query.cl : null;
      const abtestType =
        typeof router.query.ab === "string" ? router.query.ab : null;
      const inviteToken =
        getQueryText(router.query.invite) ||
        getNextPathParam(nextPath, "invite");
      const rawMail =
        getQueryText(router.query.mail) || getNextPathParam(nextPath, "mail");
      const mail = emailOnboardingToken ? "" : rawMail;
      const code =
        typeof router.query.code === "string" ? router.query.code : "";
      const callbackError =
        getQueryText(router.query.error_description) ||
        getQueryText(router.query.error_code) ||
        getQueryText(router.query.error) ||
        getAuthCallbackHashError();
      const callbackMessage =
        getQueryText(router.query.message) ||
        getAuthCallbackHashValue("message");

      if (flow === "career_email_change") {
        const { error: initializationError } = await supabase.auth.initialize();
        if (callbackError || initializationError) {
          const callbackFailure = callbackError || initializationError;
          const result = isTalentAccountEmailUnavailableError(callbackFailure)
            ? "unavailable"
            : isTalentAccountEmailChangeExpiredError(callbackFailure)
              ? "expired"
              : "error";
          if (result === "error") {
            console.error(
              "career email change callback error:",
              callbackFailure
            );
          }
          router.replace(withEmailChangeResult(nextPath, result));
          return;
        }
        if (isTalentAccountEmailChangePendingConfirmation(callbackMessage)) {
          router.replace(withEmailChangeResult(nextPath, "pending"));
          return;
        }
      } else if (code) {
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
        router.replace(
          flow === "career_email_change"
            ? withEmailChangeResult(nextPath, "error")
            : resolveAuthCallbackErrorDestination({
                error: "no_user",
                isTalentDestination,
              })
        );
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
        router.replace(
          flow === "career_email_change"
            ? withEmailChangeResult(nextPath, "error")
            : resolveAuthCallbackErrorDestination({
                error: "no_session",
                isTalentDestination,
              })
        );
        return;
      }

      if (flow === "career_email_change") {
        const syncResponse = await fetch("/api/talent/account/email/sync", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const syncPayload = await syncResponse.json().catch(() => ({}));

        if (!syncResponse.ok) {
          const result = isTalentAccountEmailUnavailableError(syncPayload)
            ? "unavailable"
            : "error";
          if (result === "error") {
            console.error("career email change sync error:", syncPayload);
          }
          router.replace(withEmailChangeResult(nextPath, result));
          return;
        }

        router.replace(
          withEmailChangeResult(
            nextPath,
            syncPayload?.status === "pending" ? "pending" : "complete"
          )
        );
        return;
      }

      if (isTalentDestination) {
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
          router.replace(
            resolveAuthCallbackErrorDestination({
              error: "talent_profile_upsert_failed",
              isTalentDestination,
            })
          );
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
        body: JSON.stringify({
          source: inferCompanyAuthEntrySource(nextPath),
        }),
      });

      const bootstrapJson = await bootstrapRes.json().catch(() => ({}));
      if (!bootstrapRes.ok) {
        console.error("bootstrap error:", bootstrapJson);
        router.replace("?error=profile_upsert_failed");
        return;
      }
      if (bootstrapJson?.persona === "talent") {
        router.replace("/career");
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
