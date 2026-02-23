"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import GradientBackground from "@/components/landing/GradientBackground";
import Header from "@/components/landing/Header";
import { handleContactUs } from "@/utils/info";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import { useCompanyUserStore } from "@/store/useCompanyUserStore";
import { useMessages } from "@/i18n/useMessage";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCountryLang } from "@/hooks/useCountryLang";

const isMissingDisplayName = (name?: string | null) => {
  const normalized = (name ?? "").trim();
  return !normalized || normalized.toLowerCase() === "anonymous";
};

type InviteCodeRecord = {
  id: string | number;
  count: number | null;
  credit: number | null;
};

export default function LoginSuccess() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSwitchingInput, setIsSwitchingInput] = useState(false);
  const [step, setStep] = useState<"code" | "name">("code");
  const [verifiedInviteCode, setVerifiedInviteCode] =
    useState<InviteCodeRecord | null>(null);
  const [invalidMessage, setInvalidMessage] = useState("");
  const [isShake, setIsShake] = useState(false);
  const [landingId, setLandingId] = useState("");
  const { m } = useMessages();

  const interactiveRef = useRef<HTMLDivElement>(null);
  const hasLoggedEnterRef = useRef(false);
  const hasLoggedCodeInputRef = useRef(false);
  const hasLoggedNameInputRef = useRef(false);
  const isMobile = useIsMobile();
  const countryLang = useCountryLang();

  const { companyUser, load } = useCompanyUserStore();
  const isNameStep = step === "name";

  const addLog = async (type: string) => {
    const body = {
      local_id: landingId,
      type: type,
      is_mobile: isMobile,
      country_lang: countryLang,
    };
    await supabase.from("landing_logs").insert(body);
  };

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
  }, [landingId]);

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
    if (companyUser?.is_authenticated && landingId) {
      const emailSuffix = companyUser?.email ? `${companyUser.email}` : "";
      addLog(`enter_my_page_${emailSuffix}`);
      router.push("/my");
    }
  }, [landingId, companyUser]);

  useEffect(() => {
    if (isShake) {
      setTimeout(() => {
        setIsShake(false);
      }, 300);
    }
  }, [isShake]);

  const transitionToNameStep = async (inviteCodeData: InviteCodeRecord) => {
    setVerifiedInviteCode(inviteCodeData);
    setCode("");
    setInvalidMessage("");
    setIsSwitchingInput(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    setStep("name");
    setIsSwitchingInput(false);
  };

  const completeInvitation = async (inviteCodeData: InviteCodeRecord) => {
    const userId = companyUser?.user_id;
    if (!userId) return;

    const initialCredit =
      typeof inviteCodeData.credit === "number" &&
      Number.isFinite(inviteCodeData.credit)
        ? inviteCodeData.credit
        : 0;

    const { error: authUpdateError } = await supabase
      .from("company_users")
      .update({
        is_authenticated: true,
      })
      .eq("user_id", userId);

    if (authUpdateError) {
      throw authUpdateError;
    }

    if (!companyUser?.is_authenticated) {
      const { error: creditsInsertError } = await supabase
        .from("credits")
        .insert({
          user_id: userId,
          remain_credit: initialCredit,
          charged_credit: initialCredit,
          type: "initial",
        });

      if (creditsInsertError) {
        throw creditsInsertError;
      }

      const nextCount =
        (typeof inviteCodeData.count === "number" ? inviteCodeData.count : 0) +
        1;
      const { error: companyCodeUpdateError } = await supabase
        .from("company_code")
        .update({ count: nextCount })
        .eq("id", inviteCodeData.id as string);

      if (companyCodeUpdateError) {
        console.error(
          "company_code count update error:",
          companyCodeUpdateError
        );
      }
    }

    await load(userId);
    router.push("/my");
  };

  const saveName = async () => {
    const userId = companyUser?.user_id;
    if (!userId) return;

    if (!verifiedInviteCode) {
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
      const { error } = await supabase
        .from("company_users")
        .update({ name: normalizedName })
        .eq("user_id", userId);

      if (error) {
        throw error;
      }

      await completeInvitation(verifiedInviteCode);
    } catch (error) {
      console.error("save company user name error:", error);
      setIsShake(true);
      setInvalidMessage(m.invitation.errors.saveNameFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const checkCode = async () => {
    const userId = companyUser?.user_id;
    if (!userId) return;

    const normalizedCode = code.trim();

    if (!normalizedCode) {
      setIsShake(true);
      setInvalidMessage(m.invitation.errors.emptyCode);
      return;
    }

    setIsLoading(true);
    setInvalidMessage("");
    try {
      const { data, error: inviteCodeError } = await supabase
        .from("company_code")
        .select("id, count, credit")
        .eq("code", normalizedCode)
        .maybeSingle();

      if (inviteCodeError || !data) {
        setIsShake(true);
        setInvalidMessage(m.invitation.errors.invalidCode);
        return;
      }

      const inviteCodeData: InviteCodeRecord = {
        id: data.id as string | number,
        count: (data.count as number | null) ?? null,
        credit: (data.credit as number | null) ?? null,
      };

      if (isMissingDisplayName(companyUser?.name)) {
        setIsLoading(false);
        await transitionToNameStep(inviteCodeData);
        return;
      }

      await completeInvitation(inviteCodeData);
    } catch (error) {
      console.error("invite code check error:", error);
      setIsShake(true);
      setInvalidMessage(m.invitation.errors.invalidCode);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-black font-inter text-white flex items-center justify-center px-4 w-full h-full">
      <Header page="company" />
      <GradientBackground interactiveRef={interactiveRef} />
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

            {/* Divider */}
            <div className="flex items-center gap-4 mt-10 mb-9">
              <div className="h-px flex-1 bg-neutral-600" />
              <span className="text-xs text-neutral-500">
                {m.invitation.divider}
              </span>
              <div className="h-px flex-1 bg-neutral-600" />
            </div>

            {/* Waitlist button */}
            <button
              onClick={() => {
                addLog("click_invitation_waitlist");
                router.push("/join");
              }}
              className="w-full rounded-full bg-neutral-50 text-black py-3.5 text-sm md:text-base font-medium hover:bg-neutral-200 active:scale-95 transition-all duration-200"
            >
              {m.invitation.waitlist}
            </button>

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
