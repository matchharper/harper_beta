"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import GradientBackground from "@/components/landing/GradientBackground";
import Header from "@/components/landing/Header";
import { handleContactUs } from "@/utils/info";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/toast/toast";
import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCountryMessages } from "@/i18n/useCountryMessage";
import {
  RequestAccessForm,
  type RequestAccessValues,
} from "@/components/Modal/RequestAccessModal";

const isMissingDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim();
  return !normalized || normalized.toLowerCase() === "anonymous";
};

export default function InvitationPage() {
  const router = useRouter();
  const [landingId, setLandingId] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const { m, countryLang } = useCountryMessages();

  const interactiveRef = useRef<HTMLDivElement>(null);
  const hasLoggedEnterRef = useRef(false);
  const isMobile = useIsMobile();
  const { companyUser } = useCompanyUserStore();

  const addLog = useCallback(
    async (type: string) => {
      const body = {
        local_id: landingId,
        type,
        is_mobile: isMobile,
        country_lang: countryLang,
      };
      await supabase.from("landing_logs").insert(body);
    },
    [countryLang, isMobile, landingId]
  );

  useEffect(() => {
    const localId = localStorage.getItem("harper_landing_id_0209");
    if (localId) {
      setLandingId(localId);
    }
  }, []);

  useEffect(() => {
    if (!landingId || hasLoggedEnterRef.current) return;

    hasLoggedEnterRef.current = true;
    const emailSuffix = companyUser?.email ? `:${companyUser.email}` : "";
    void addLog(`request_access_enter_${emailSuffix}`);
  }, [addLog, companyUser?.email, landingId]);

  useEffect(() => {
    if (!companyUser?.is_authenticated) return;

    if (landingId) {
      const emailSuffix = companyUser?.email ? `${companyUser.email}` : "";
      void addLog(`enter_my_page_${emailSuffix}`);
    }

    router.push("/my");
  }, [
    addLog,
    companyUser?.email,
    companyUser?.is_authenticated,
    landingId,
    router,
  ]);

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const submitRequestAccess = async (values: RequestAccessValues) => {
    const normalizedValues = {
      name: values.name.trim(),
      company: values.company.trim(),
      role: values.role.trim(),
      hiringNeed: values.hiringNeed.trim(),
    };

    if (!normalizedValues.name || !normalizedValues.company) {
      showToast({
        message: m.invitation.requestAccess.errors.invalidForm,
        variant: "white",
      });
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      showToast({
        message: m.invitation.requestAccess.errors.missingSession,
        variant: "white",
      });
      return;
    }

    const response = await fetch("/api/request-access/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        ...normalizedValues,
        isMobile,
      }),
    });

    if (!response.ok) {
      showToast({
        message: m.invitation.requestAccess.errors.submitFailed,
        variant: "white",
      });
      return;
    }

    void addLog("submit_request_access");
    setHasSubmitted(true);
    showToast({
      message: m.invitation.requestAccess.submitted,
      variant: "white",
    });
  };

  return (
    <div className="relative flex min-h-screen h-full w-full items-center justify-center bg-black px-4 font-inter text-white">
      <Header page="company" />
      <GradientBackground interactiveRef={interactiveRef} />

      <div className="z-20 py-12 flex w-full max-w-xl flex-col items-center space-y-4 md:space-y-8 text-center">
        <div className="h-9 w-9 rounded-full">
          <Image
            src="/svgs/logo_white.svg"
            alt="Harper"
            width={36}
            height={36}
          />
        </div>

        <div>
          <h1 className="text-2xl font-normal tracking-tight md:text-4xl">
            {m.invitation.title}
          </h1>
          <p className="mt-4 md:mt-8 text-sm font-light leading-relaxed text-xgray500 md:text-base">
            {m.invitation.description.split("\n").map((line) => (
              <React.Fragment key={line}>
                {line}
                <br />
              </React.Fragment>
            ))}
          </p>
        </div>

        <div className="w-full max-w-lg">
          <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-6 shadow-xl backdrop-blur-md md:px-8 md:py-8">
            <div className="text-left">
              {companyUser?.email && (
                <div className="mb-4 text-sm text-white/70 font-light">
                  {companyUser.email}
                </div>
              )}
            </div>

            <div className="mt-0">
              {hasSubmitted ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-5 py-5 text-left">
                  <div className="text-base font-medium text-white">
                    {m.invitation.requestAccess.title}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/65">
                    {m.invitation.requestAccess.submitted}
                  </div>
                </div>
              ) : (
                <RequestAccessForm
                  onSubmit={submitRequestAccess}
                  copy={m.invitation.requestAccess}
                  initialValues={{
                    name: isMissingDisplayName(companyUser?.name)
                      ? ""
                      : (companyUser?.name ?? ""),
                    company: companyUser?.company ?? "",
                    role: companyUser?.role ?? "",
                  }}
                  className="space-y-4"
                  submitButtonClassName="mt-6 inline-flex w-full items-center justify-center rounded-full bg-white px-5 py-3.5 text-sm font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-70"
                />
              )}
            </div>

            <button
              onClick={handleContactUs}
              className="mt-8 mb-2 w-full text-xs text-neutral-500 transition-all duration-200 hover:text-neutral-400 md:mb-4 md:text-sm"
            >
              {m.invitation.contact}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
