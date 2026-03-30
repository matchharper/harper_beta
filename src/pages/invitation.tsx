"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import GradientBackground from "@/components/landing/GradientBackground";
import Header from "@/components/landing/Header";
import { handleContactUs } from "@/utils/info";
import { useRouter } from "next/navigation";
import { showToast } from "@/components/toast/toast";

import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCountryMessages } from "@/i18n/useCountryMessage";
import RequestAccessModal, {
  type RequestAccessValues,
} from "@/components/Modal/RequestAccessModal";

const isMissingDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim();
  return !normalized || normalized.toLowerCase() === "anonymous";
};

type VerifyInviteResponse = {
  ok: boolean;
  requiresName: boolean;
};

const getErrorCode = (error: unknown) => {
  return error instanceof Error ? error.message.toLowerCase() : "";
};

export default function LoginSuccess() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitchingInput, setIsSwitchingInput] = useState(false);
  const [step, setStep] = useState<"code" | "name">("code");
  const [verifiedCode, setVerifiedCode] = useState("");
  const [invalidMessage, setInvalidMessage] = useState("");
  const [isShake, setIsShake] = useState(false);
  const [landingId, setLandingId] = useState("");
  const [isRequestAccessOpen, setIsRequestAccessOpen] = useState(false);
  const { m, countryLang } = useCountryMessages();

  const interactiveRef = useRef<HTMLDivElement>(null);
  const hasLoggedEnterRef = useRef(false);
  const hasLoggedCodeInputRef = useRef(false);
  const hasLoggedNameInputRef = useRef(false);
  const isMobile = useIsMobile();
  const { companyUser, load } = useCompanyUserStore();
  const isNameStep = step === "name";

  const getInvitationErrorMessage = useCallback(
    (error: unknown, fallbackMessage: string) => {
      const errorCode = getErrorCode(error);

      switch (errorCode) {
        case "invite_domain_mismatch":
          return m.invitation.errors.domainMismatch;
        case "invalid_invite_code":
        case "invite_code_exhausted":
          return m.invitation.errors.invalidCode;
        case "missing_name":
          return m.invitation.errors.emptyName;
        default:
          return fallbackMessage;
      }
    },
    [m.invitation.errors]
  );

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
      setLandingId(localId as string);
    }
  }, []);

  useEffect(() => {
    if (!landingId || hasLoggedEnterRef.current) return;
    hasLoggedEnterRef.current = true;
    const emailSuffix = companyUser?.email ? `:${companyUser.email}` : "";
    addLog(`invitation_enter_${emailSuffix}`);
  }, [addLog, companyUser?.email, landingId]);

  // useEffect(() => {
  //   const excludedEmails = new Set([
  //     "chris@gmail.com",
  //     // "khj605123@gmail.com",
  //   ]);

  //   const updateTeamEmail = (email?: string | null) => {
  //     setIsTeamEmail(email ? excludedEmails.has(email) : false);
  //     setIsTeamEmailChecked(true);
  //   };

  //   supabase.auth.getUser().then(({ data }) => {
  //     updateTeamEmail(data.user?.email);
  //   });

  //   const { data: authListener } = supabase.auth.onAuthStateChange(
  //     (_event, session) => {
  //       updateTeamEmail(session?.user?.email);
  //     }
  //   );

  //   return () => {
  //     authListener.subscription.unsubscribe();
  //   };
  // }, []);

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

  useEffect(() => {
    if (isShake) {
      setTimeout(() => {
        setIsShake(false);
      }, 300);
    }
  }, [isShake]);

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const resolveUserId = async () => {
    if (companyUser?.user_id) return companyUser.user_id;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  };

  const verifyInviteCode = async (
    inviteCode: string
  ): Promise<VerifyInviteResponse> => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("missing_access_token");
    }

    const response = await fetch("/api/invitation/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ code: inviteCode }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const apiCode = String(payload?.code ?? "").toLowerCase();
      if (
        apiCode === "invalid_invite_code" ||
        apiCode === "invite_code_exhausted"
      ) {
        return { ok: false, requiresName: false };
      }
      throw new Error(apiCode || `verify_failed_${response.status}`);
    }

    const payload = (await response.json().catch(() => ({}))) as {
      requiresName?: boolean;
    };
    return {
      ok: true,
      requiresName: Boolean(payload?.requiresName),
    };
  };

  const redeemInvitation = async (inviteCode: string, name?: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("missing_access_token");
    }

    const response = await fetch("/api/invitation/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        code: inviteCode,
        name: name?.trim() || undefined,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const apiCode = String(payload?.code ?? "").toLowerCase();
      throw new Error(apiCode || `redeem_failed_${response.status}`);
    }
  };

  const transitionToNameStep = async (inviteCode: string) => {
    setVerifiedCode(inviteCode);
    setCode("");
    setInvalidMessage("");
    setIsSwitchingInput(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    setStep("name");
    setIsSwitchingInput(false);
  };

  const completeInvitation = async (inviteCode: string, name?: string) => {
    const userId = await resolveUserId();
    if (!userId) {
      throw new Error("missing_user_id");
    }

    await redeemInvitation(inviteCode, name);

    await load(userId);
    router.push("/my");
  };

  const saveName = async () => {
    if (!verifiedCode) {
      setInvalidMessage(m.invitation.errors.invalidCode);
      setStep("code");
      return;
    }

    const normalizedName = nameInput.trim();
    if (!normalizedName) {
      setIsShake(true);
      setInvalidMessage(m.invitation.errors.emptyName);
      return;
    }

    setIsLoading(true);
    setInvalidMessage("");
    try {
      await completeInvitation(verifiedCode, normalizedName);
    } catch (error) {
      console.error("save company user name error:", error);
      setIsShake(true);
      setInvalidMessage(
        getInvitationErrorMessage(error, m.invitation.errors.saveNameFailed)
      );
    } finally {
      setIsLoading(false);
    }
  };

  const submitRequestAccess = async (values: RequestAccessValues) => {
    const normalizedValues = {
      name: values.name.trim(),
      company: values.company.trim(),
      role: values.role.trim(),
      hiringNeed: values.hiringNeed.trim(),
    };

    if (
      !normalizedValues.name ||
      !normalizedValues.company
    ) {
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

    addLog("submit_request_access");
    setIsRequestAccessOpen(false);
    showToast({
      message: m.invitation.requestAccess.submitted,
      variant: "white",
    });
  };

  const checkCode = async () => {
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      setIsShake(true);
      setInvalidMessage(m.invitation.errors.emptyCode);
      return;
    }

    setIsLoading(true);
    setInvalidMessage("");
    try {
      const verifyResult = await verifyInviteCode(normalizedCode);
      if (!verifyResult.ok) {
        setIsShake(true);
        setInvalidMessage(m.invitation.errors.invalidCode);
        return;
      }

      if (
        verifyResult.requiresName ||
        isMissingDisplayName(companyUser?.name)
      ) {
        setIsLoading(false);
        await transitionToNameStep(normalizedCode);
        return;
      }

      await completeInvitation(normalizedCode);
    } catch (error) {
      console.error("invite code check error:", error);
      setIsShake(true);
      setInvalidMessage(
        getInvitationErrorMessage(error, m.invitation.errors.invalidCode)
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black font-inter text-white flex items-center justify-center px-4 w-full h-full">
      <Header page="company" />
      <GradientBackground interactiveRef={interactiveRef} />
      <RequestAccessModal
        open={isRequestAccessOpen}
        onClose={() => setIsRequestAccessOpen(false)}
        onSubmit={submitRequestAccess}
        initialValues={{
          name: isMissingDisplayName(companyUser?.name)
            ? ""
            : (companyUser?.name ?? ""),
          company: companyUser?.company ?? "",
          role: companyUser?.role ?? "",
        }}
        copy={m.invitation.requestAccess}
      />
      <div className="z-20 flex flex-col items-center text-center max-w-xl w-full space-y-10">
        <div className="w-9 h-9 rounded-full">
          <Image
            src="/svgs/logo_white.svg"
            alt="Harper"
            width={36}
            height={36}
          />
        </div>

        {/* Heading */}
        <div className="">
          <h1 className="text-2xl md:text-4xl font-normal tracking-tight">
            {isNameStep ? m.invitation.nameTitle : m.invitation.title}
          </h1>
          <p className="text-sm md:text-base font-light text-xgray500 leading-relaxed mt-8">
            {(isNameStep
              ? m.invitation.nameDescription
              : m.invitation.description
            )
              .split("\n")
              .map((line) => (
                <React.Fragment key={line}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-lg">
          <div
            className={`rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-xl px-6 py-6 md:px-8 md:py-8 ${
              isShake ? "animate-shake" : ""
            }`}
          >
            {/* Invite code + continue */}
            <div
              className={`transition-opacity duration-150 ${
                isSwitchingInput
                  ? "opacity-0 pointer-events-none"
                  : "opacity-100"
              }`}
            >
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isNameStep) {
                    saveName();
                    return;
                  }
                  checkCode();
                }}
                className={`flex flex-col gap-3 items-stretch ${
                  isNameStep ? "" : "relative md:flex-row md:gap-4"
                }`}
              >
                <input
                  type="text"
                  value={isNameStep ? nameInput : code}
                  onChange={(e) => {
                    if (isNameStep) {
                      setNameInput(e.target.value);
                    } else {
                      setCode(e.target.value);
                    }
                    if (invalidMessage) {
                      setInvalidMessage("");
                    }
                  }}
                  onFocus={() => {
                    if (isNameStep) {
                      if (!hasLoggedNameInputRef.current) {
                        hasLoggedNameInputRef.current = true;
                        addLog("click_invitation_name_input");
                      }
                      return;
                    }

                    if (!hasLoggedCodeInputRef.current) {
                      hasLoggedCodeInputRef.current = true;
                      addLog("click_invitation_code_input");
                    }
                  }}
                  placeholder={
                    isNameStep
                      ? m.invitation.namePlaceholder
                      : m.invitation.placeholder
                  }
                  className="flex-1 rounded-3xl w-full bg-white/10 border border-neutral-800/80 px-4 py-4 text-sm md:text-sm
                  transition-all duration-200 hover:border-xgray700
                   placeholder:text-neutral-300 focus:outline-none font-light focus:ring-0.5 focus:ring-xgray600 focus:border-xgray600"
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`flex items-center justify-center rounded-full bg-white/90 hover:bg-white/80 text-xgrayblack active:scale-95 transition-all duration-200 text-sm font-normal disabled:opacity-60 ${
                    isNameStep
                      ? "w-full py-3.5"
                      : "absolute right-2 top-[7px] w-20 h-10"
                  }`}
                >
                  {isLoading ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : isNameStep ? (
                    m.invitation.nameSubmit
                  ) : (
                    m.invitation.submit
                  )}
                </button>
              </form>
            </div>

            {invalidMessage && (
              <div className="text-sm text-red-500/90 mt-2">
                {invalidMessage}
              </div>
            )}

            <div className="flex items-center gap-4 mt-10 mb-9">
              <div className="h-px flex-1 bg-neutral-600" />
              <span className="text-xs text-neutral-500">
                {m.invitation.divider}
              </span>
              <div className="h-px flex-1 bg-neutral-600" />
            </div>

            <button
              onClick={() => {
                addLog("click_invitation_waitlist");
                setIsRequestAccessOpen(true);
              }}
              className="w-full rounded-full bg-neutral-50 text-black py-3.5 text-sm md:text-base font-medium hover:bg-neutral-200 active:scale-95 transition-all duration-200"
            >
              {m.invitation.waitlist}
            </button>
            <div className="text-sm text-hgray600 mt-1"></div>

            {/* Logout */}
            <button
              onClick={handleContactUs}
              className="mt-8 w-full text-xs md:text-sm text-neutral-500 hover:text-neutral-400 mb-2 md:mb-4 transition-all duration-200"
            >
              {m.invitation.contact}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
