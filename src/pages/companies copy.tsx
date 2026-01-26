import React, { useEffect, useState } from "react";
import "../globals.css";
import { ArrowRight, Building, Inbox, LoaderCircle } from "lucide-react";
import { showToast } from "@/components/toast/toast";
import Animate from "@/components/landing/Animate";
import Header from "@/components/landing/Header";
import { supabase } from "@/lib/supabase";
import Head from "next/head";
import router from "next/router";
import { v4 } from "uuid";
import { useIsMobile } from "@/hooks/useIsMobile";

export const isValidCompanyEmail = (email: string): boolean => {
  const trimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return false;

  const personalDomains = [
    "gmail.com",
    "naver.com",
    "daum.net",
    "daum.com",
    "hanmail.net",
    "yahoo.com",
    "outlook.com",
    "icloud.com",
    "proton.me",
  ];

  const domain = trimmed.split("@")[1].toLowerCase();

  // 3. 개인용 이메일인지 체크
  if (personalDomains.includes(domain)) return false;

  return true;
};

export default function CompanyPage() {
  const [landingId, setLandingId] = useState("");
  const isMobile = useIsMobile();

  useEffect(() => {
    const localId = localStorage.getItem("harper_landing_id");
    if (!localId) {
      const newId = v4();
      localStorage.setItem("harper_landing_id", newId);
      setLandingId(newId);
      const body = {
        local_id: landingId,
        action: "enter_company",
        is_mobile: isMobile,
      };
      // supabase.from("landing_logs").insert(body);
    } else {
      setLandingId(localId as string);
    }
  }, []);

  const handleContactUs = async () => {
    await navigator.clipboard.writeText("chris@asksonus.com");
    showToast({
      message: "Email copied to clipboard",
      variant: "white",
    });
  };

  // const handleJoinWaitlist = async (e: React.MouseEvent<HTMLButtonElement>) => {
  //   e.preventDefault();
  //   setUploading(true);
  //   if (!isValidEmail(email)) {
  //     showToast({
  //       message: "유효한 회사 이메일을 입력해주세요.",
  //       variant: "white",
  //     });
  //     setUploading(false);
  //     return;
  //   }

  //   const body = {
  //     email: email,
  //     type: 1,
  //     companyName: companyName,
  //     expect: expect,
  //   };
  //   await supabase.from("harper_waitlist").insert(body);

  //   showToast({
  //     message: "등록이 완료되었습니다. 감사합니다.",
  //     variant: "white",
  //   });
  //   setUploading(false);
  // };

  return (
    <main className="min-h-screen text-white font-inter">
      <Head>
        <title>Harper | AI Recruiter</title>
        <meta
          name="description"
          content="Harper is your team's dedicated AI recruiter."
        />
      </Head>
      {/* Background image + overlay */}
      <div
        className="relative min-h-screen w-full bg-cover bg-center bg-no-repeat flex flex-col"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, rgba(0,0,0,0.8), rgba(0,0,0,0.8)), url('/images/company_back.png')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <header className="flex items-center justify-between px-4 lg:px-8 py-4 text-sm">
          <div className="text-lg font-light font-garamond w-[10%]">harper</div>

          <nav className="flex items-center justify-end sm:justify-center gap-8 text-sm sm:text-sm w-[60%] sm:w-[40%]"></nav>
          <div className="w-[40%] sm:w-[10%] text-right">
            <div
              className="font-light cursor-pointer opacity-60 hover:opacity-75"
              onClick={() => {
                const body = {
                  local_id: landingId,
                  action: "click_candidates",
                  is_mobile: isMobile,
                };
                // supabase.from("landing_logs").insert(body);
                router.push("/");
              }}
            >
              For candidates
            </div>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-start px-4 sm:px-8 pb-10 sm:pb-16 pt-12 md:pt-32">
          <Animate
            triggerOnce={true}
            className="flex flex-row items-center justify-between px-1 w-[144px] h-[32px] border border-[#0FA4E8] text-white gap-1.5 rounded-full"
          >
            <div className="w-[22px] h-[22px] bg-[#0FA4E8] rounded-full flex items-center justify-center">
              {/* <Inbox className="w-[13px] text-white" /> */}
              <Building className="w-[13px] text-white" />
            </div>
            <div className="text-[13px] font-normal w-[80%] pl-1">
              For companies
            </div>
          </Animate>

          <Animate
            className="mt-4 md:mt-8 max-w-2xl text-center"
            delay={0.4}
            triggerOnce={true}
          >
            <h1 className="text-3xl md:text-4xl font-normal leading-snug">
              최고의 기업이 <br className="block sm:hidden" />
              최정예 인재를 만나는 곳
            </h1>

            <p className="mt-4 text-sm md:text-base text-white/60 leading-relaxed font-light">
              Recruiter agent 하퍼가 지원자와 직접 이야기하여 알아낸 정보와
              이력서, 깃헙, 논문 등 모든 정보를{" "}
              <br className="hidden sm:block" />
              사용하여 불필요한 탐색 시간을 최소화하고 회사의 문화와 필요 역량에
              가장 적합한 인재를 연결해줍니다.
            </p>
          </Animate>

          <Animate
            delay={0.8}
            triggerOnce={true}
            className="flex flex-row items-center justify-center gap-4 mt-12 sm:mt-14 "
          >
            <div
              onClick={() => {
                const body = {
                  local_id: landingId,
                  action: "click_join",
                  is_mobile: isMobile,
                };
                // supabase.from("landing_logs").insert(body);
                router.push("/join");
              }}
              className="group flex rounded-full px-6 py-3 items-center justify-center font-normal
            cursor-pointer text-black bg-white transition-all duration-300 gap-2"
            >
              <span className="text-center">Join waitlist</span>
              <ArrowRight
                strokeWidth={2.2}
                className="group-hover:w-[16px] w-0 transition-all duration-300"
              />
            </div>
            <div
              onClick={handleContactUs}
              className="flex rounded-full px-5 py-3.5 items-center justify-center font-light text-sm
            cursor-pointer text-white border border-white/15 bg-white/0 transition-all duration-300 gap-2 hover:bg-white/5"
            >
              Contact Us
            </div>
          </Animate>

          {/* Form card */}
          {/* <div className="mt-10 sm:mt-14 w-full flex justify-center">
            <Animate
              triggerOnce={true}
              className="w-full max-w-2xl rounded-[20px] bg-white text-black shadow-2xl px-5 py-6"
              delay={0.8}
            >
              <form className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  <div className="flex flex-col text-xs sm:text-sm">
                    <label className="mb-1 text-xgray700">이메일</label>
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      className="border-b border-gray-200 focus:border-black outline-none py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-col text-xs sm:text-sm">
                    <label className="mb-1 text-xgray700">회사 명</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="border-b border-gray-200 focus:border-black outline-none py-2 text-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col text-xs sm:text-sm">
                  <label className="mb-1 text-gray-500">
                    어떤 역할을 찾고 계신가요?
                  </label>
                  <textarea
                    rows={3}
                    className="border-b border-gray-200 focus:border-black outline-none py-2 text-sm resize-none"
                    value={expect}
                    onChange={(e) => setExpect(e.target.value)}
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    onClick={handleJoinWaitlist}
                    className="flex items-center justify-center w-full rounded-[16px] bg-black text-white py-3 text-base font-normal hover:bg-black/90 transition"
                  >
                    {uploading ? (
                      <LoaderCircle className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      "Join waitlist"
                    )}
                  </button>
                </div>
              </form>
            </Animate>
          </div> */}
        </div>
        <Animate delay={2.2} duration={0.8} isUp={false}>
          <div className="flex flex-row items-center justify-between gap-4 pb-2 px-4 w-full text-white/40">
            <div className="font-garamond text-base font-thin">
              Harper is your team{"'"}s
              <br className="block sm:hidden" />
              dedicated AI recruiter
            </div>
            <div className="cursor-pointer font-inter text-xs md:text-sm font-light hover:text-white/75"></div>
          </div>
        </Animate>
      </div>
    </main>
  );
}
