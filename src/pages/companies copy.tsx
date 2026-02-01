import React, { useEffect, useRef, useState } from "react";
import "../globals.css";
import { ArrowRight, Building, Inbox, LoaderCircle } from "lucide-react";
import { showToast } from "@/components/toast/toast";
import Animate from "@/components/landing/Animate";
import { supabase } from "@/lib/supabase";
import Head from "next/head";
import router from "next/router";
import { v4 } from "uuid";
import { useIsMobile } from "@/hooks/useIsMobile";
import { FallingTags } from "@/components/landing/FallingTags";
import GradientBackground from "@/components/landing/GradientBackground";
import Header from "@/components/landing/Header";
import LoginModal from "@/components/Modal/LoginModal";
import { logger } from "@/utils/logger";

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
  const [isOpenLoginModal, setIsOpenLoginModal] = useState(false);
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
    });
  };

  const ref = useRef<HTMLDivElement | null>(null);

  // target: 실제 마우스 위치, current: CSS에 쓰는 (느리게 따라가는) 위치
  const targetPos = useRef({ x: 50, y: 40 });
  const currentPos = useRef({ x: 50, y: 40 });
  const frameId = useRef<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // 마우스는 즉시 갱신 (타겟만)
    targetPos.current.x = x;
    targetPos.current.y = y;
  };

  useEffect(() => {
    const animate = () => {
      const el = ref.current;
      if (el) {
        // lerp: current += (target - current) * k
        const k = 0.08; // 작을수록 더 느리게 따라옴
        currentPos.current.x +=
          (targetPos.current.x - currentPos.current.x) * k;
        currentPos.current.y +=
          (targetPos.current.y - currentPos.current.y) * k;

        el.style.setProperty("--mouse-x", `${currentPos.current.x}%`);
        el.style.setProperty("--mouse-y", `${currentPos.current.y}%`);
      }

      frameId.current = requestAnimationFrame(animate);
    };

    frameId.current = requestAnimationFrame(animate);
    return () => {
      if (frameId.current != null) cancelAnimationFrame(frameId.current);
    };
  }, []);

  const interactiveRef = useRef<HTMLDivElement | null>(null);

  const login = async () => {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    logger.log("redirectTo : ", redirectTo);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
      },
    });
    logger.log(data);

    if (error) throw error;
    return data;
  };

  const customLogin = async (email: string, password: string) => {
    logger.log("customLogin : ", email, password);
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback`
        : undefined;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      logger.log("성공 ", data);

      if (data.user?.user_metadata.email_verified) {
        setIsOpenLoginModal(false);
        router.push("/invitation");
        // return data;
      }

      return null;
    } catch (error) {
      return null;
    }
  };

  return (
    <main
      onMouseMove={handleMouseMove}
      className="
      min-h-screen text-white font-inter
      flex flex-col items-center justify-center
    "
    >
      <Head>
        <title>Harper | AI Recruiter</title>
        <meta
          name="description"
          content="Harper is your team's dedicated AI recruiter."
        />
      </Head>
      {/* Background image + overlay */}
      <div className="relative min-h-screen w-full flex flex-col">
        <GradientBackground interactiveRef={interactiveRef} />
        <Animate
          className="w-full"
          delay={4.0}
          triggerOnce={true}
          isUp={false}
          duration={0.8}
        >
          <Header page="company" />
        </Animate>
        <div className="flex-1 flex flex-col items-center justify-between px-4 sm:px-8 pt-24 md:pt-40 z-20">
          <div className="flex-1 flex flex-col items-center justify-start md:mt-0 mt-[4vh]">
            <Animate
              className="max-w-4xl text-center flex flex-col items-center justify-center"
              delay={0.4}
              triggerOnce={true}
            >
              <h1 className="text-3xl md:text-5xl font-light tracking-tighter leading-tight">
                {/* Find the best AI Engineer/Researcher. */}
                최고의 <span className="font-extralight">AI</span>{" "}
                엔지니어/리서처를 <br className="block md:hidden" /> 찾아보세요.
              </h1>
            </Animate>
            <Animate
              className="max-w-4xl text-center flex flex-col items-center justify-center"
              delay={0.8}
              triggerOnce={true}
            >
              <p className="mt-6 text-[20px] md:text-[32px] text-white font-extralight tracking-tighter">
                {/* Find, track, and hire the best researchers. */}
                훌륭한 인재가 곧 회사를 정의합니다.
              </p>

              <p className="mt-4 text-sm md:text-[18px] text-white/60 leading-relaxed font-extralight max-w-[620px]">
                {/* Research talent is a competitive advantage, and we{"'"}re here
                to help you win that advantage. */}
                하퍼가 이력, 깃헙, 논문 등 모든 비정형 정보를 사용하여 회사의
                문화와 필요 역량에 가장 적합한 인재를 찾고 연결해드립니다.
              </p>
            </Animate>

            <Animate
              delay={1.2}
              triggerOnce={true}
              className="flex flex-row items-center justify-center gap-4 mt-12 sm:mt-14 "
            >
              <div
                onClick={() => {
                  setIsOpenLoginModal(true);
                }}
                className="group flex rounded-full h-12 md:h-16 px-5 md:px-10 items-center justify-center font-medium text-sm md:text-lg
            cursor-pointer text-black bg-white transition-all duration-300 gap-2 active:scale-95"
              >
                <span className="text-center">Get started</span>
                <ArrowRight
                  strokeWidth={2.2}
                  className="group-hover:w-[16px] w-0 transition-all duration-300"
                />
              </div>
              <div
                onClick={handleContactUs}
                className="flex rounded-full px-5 md:px-8 h-12 md:h-16 items-center justify-center font-light text-sm md:text-lg
            cursor-pointer text-white border border-white/15 bg-white/0 transition-all duration-300 gap-2 hover:bg-white/5 active:scale-95"
              >
                Contact Us
              </div>
            </Animate>
          </div>

          <div className="z-20 w-full mb-32">
            <FallingTags />
          </div>
        </div>
        <Animate
          delay={4.0}
          isUp={false}
          duration={0.8}
          className="z-20 absolute bottom-0 left-0 w-full hidden md:flex"
        >
          <div className="flex flex-row items-center justify-between gap-4 pb-2 px-4 w-full text-white/40">
            <div className="font-garamond text-base font-thin">
              Harper is your team{"'"}s
              <br className="block sm:hidden" />
              dedicated AI recruiter.
            </div>
            <div className="cursor-pointer font-inter text-xs md:text-sm font-light hover:text-white/75"></div>
          </div>
        </Animate>
      </div>
      <LoginModal
        open={isOpenLoginModal}
        onClose={() => setIsOpenLoginModal(false)}
        onGoogle={login}
        onConfirm={customLogin}
      />
    </main>
  );
}
