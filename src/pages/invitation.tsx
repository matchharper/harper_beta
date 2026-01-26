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

export default function LoginSuccess() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [invalidMessage, setInvalidMessage] = useState("");
  const [isShake, setIsShake] = useState(false);

  const interactiveRef = useRef<HTMLDivElement>(null);

  const { companyUser, load } = useCompanyUserStore();

  useEffect(() => {
    if (companyUser?.is_authenticated) {
      router.push("/my");
    }
  }, [companyUser]);

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
      setInvalidMessage("초대 코드를 입력해주세요.");
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
              remain_credit: 300,
              charged_credit: 300,
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
          setInvalidMessage("초대 코드가 일치하지 않습니다.");
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
            코드를 입력해주세요.
          </h1>
          <p className="text-sm md:text-base font-light text-xgray500 leading-relaxed mt-8">
            하퍼는 현재 비공개 베타 중입니다. 초대 코드를 입력해주세요.
            <br />
            초대코드가 필요하신분은 대기자 명단에 등록해주세요.
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
                placeholder="초대 코드"
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
                  "입력하기"
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
              <span className="text-xs text-neutral-500">또는</span>
              <div className="h-px flex-1 bg-neutral-600" />
            </div>

            {/* Waitlist button */}
            <button
              onClick={() => {
                router.push("/join");
              }}
              className="w-full rounded-full bg-neutral-50 text-black py-3.5 text-sm md:text-base font-medium hover:bg-neutral-200 active:scale-95 transition-all duration-200"
            >
              사전 등록하기
            </button>

            {/* Logout */}
            <button
              onClick={handleContactUs}
              className="mt-8 w-full text-xs md:text-sm text-neutral-500 hover:text-neutral-400 mb-2 md:mb-4 transition-all duration-200"
            >
              문의하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
