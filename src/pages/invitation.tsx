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
import GaPageView from "@/components/ga";

const INITIAL_CREDIT = 10;

export default function LoginSuccess() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [invalidMessage, setInvalidMessage] = useState("");
  const [isShake, setIsShake] = useState(false);
  const [landingId, setLandingId] = useState("");
  const { m } = useMessages();

  const interactiveRef = useRef<HTMLDivElement>(null);
  const hasLoggedEnterRef = useRef(false);
  const hasLoggedCodeInputRef = useRef(false);
  const isMobile = useIsMobile();
  const countryLang = useCountryLang();

  const { companyUser, load } = useCompanyUserStore();

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

  const checkCode = async () => {
    setIsLoading(true);

    if (!code) {
      setIsShake(true);
      setInvalidMessage(m.invitation.errors.emptyCode);
      setIsLoading(false);
      return;
    }

    const domain = companyUser?.email?.split("@")[1];
    supabase
      .from("company_code")
      .select("*")
      .eq("code", code)
      .single()
      .then(async (res) => {
        if (res.data) {
          await supabase
            .from("company_users")
            .update({
              is_authenticated: true,
            })
            .eq("user_id", companyUser?.user_id);
          if (!companyUser.is_authenticated) {
            await supabase.from("credits").insert({
              user_id: companyUser?.user_id,
              remain_credit: INITIAL_CREDIT,
              charged_credit: INITIAL_CREDIT,
              type: "initial",
            });
            await supabase.from("company_code").upsert({
              code: code,
              count: res.data.count + 1,
            });
            await load(companyUser?.user_id);
          }
          router.push("/my");
        } else {
          setIsShake(true);
          setInvalidMessage(m.invitation.errors.invalidCode);
        }
        setIsLoading(false);
      });
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
            {m.invitation.title}
          </h1>
          <p className="text-sm md:text-base font-light text-xgray500 leading-relaxed mt-8">
            {m.invitation.description.split("\n").map((line) => (
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
            <form
              onSubmit={(e) => {
                e.preventDefault();
                checkCode();
              }}
              className="flex flex-col relative md:flex-row gap-3 md:gap-4 items-stretch"
            >
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onFocus={() => {
                  if (!hasLoggedCodeInputRef.current) {
                    hasLoggedCodeInputRef.current = true;
                    addLog("click_invitation_code_input");
                  }
                }}
                placeholder={m.invitation.placeholder}
                className="flex-1 rounded-3xl w-full bg-white/10 border border-neutral-800/80 px-4 py-4 text-sm md:text-sm
                transition-all duration-200 hover:border-xgray700
                 placeholder:text-neutral-300 focus:outline-none font-light focus:ring-0.5 focus:ring-xgray600 focus:border-xgray600"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="absolute right-2 top-[7px] flex items-center justify-center rounded-full bg-white/90 hover:bg-white/80 text-xgrayblack active:scale-95 transition-all duration-200 w-20 h-10 text-sm font-normal"
              >
                {isLoading ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : (
                  m.invitation.submit
                )}
              </button>
            </form>

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
