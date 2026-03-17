import React, { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Head from "next/head";
import router from "next/router";
import { BaseSectionLayout } from "@/components/landing/GridSectionLayout";
import Head1 from "@/components/landing/Head1";
import Animate from "@/components/landing/Animate";
import QuestionAnswer from "@/components/landing/Questions";
import LandingHeader from "@/components/landing/LandingHeader";
import { useMessages } from "@/i18n/useMessage";
import { supabase } from "@/lib/supabase";
import Footer from "@/components/landing/Footer";

const LoginModal = dynamic(() => import("@/components/Modal/LoginModal"));
const PricingSection = dynamic(() => import("@/components/landing/Pricing"));

type Billing = "monthly" | "yearly";

export default function PricingPage() {
  const { m, locale } = useMessages();
  const [isOpenLoginModal, setIsOpenLoginModal] = useState(false);

  const seoMeta = useMemo(() => {
    if (locale === "ko") {
      return {
        title: "Harper Pricing | 팀을 위한 요금제",
        description:
          "Harper의 플랜과 결제/이용 정책을 확인하고 팀에 맞는 요금제를 선택하세요.",
      };
    }

    return {
      title: "Harper Pricing | Plans for Growing Teams",
      description:
        "Explore Harper plans and billing and usage policies to choose the best option for your team.",
    };
  }, [locale]);

  const handleCloseLoginModal = useCallback(() => {
    setIsOpenLoginModal(false);
  }, []);

  const login = useCallback(async () => {
    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auths/callback`
        : undefined;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
      },
    });

    if (error) throw error;
    if (data?.url && typeof window !== "undefined") {
      window.location.assign(data.url);
    }
    return data;
  }, []);

  const customLogin = useCallback(
    async (email: string, password: string) => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          const authError = error as Error & {
            code?: string;
            status?: number;
          };
          console.error("[auth] signInWithPassword failed", {
            message: authError.message,
            code: authError.code,
            status: authError.status,
            name: authError.name,
          });

          const details = [authError.message];
          if (authError.status) details.push(`status:${authError.status}`);
          if (authError.code) details.push(`code:${authError.code}`);
          return { message: details.join(" | ") };
        }

        const user = data.user;
        if (!user) {
          return { message: m.auth.invalidAccount };
        }

        const isEmailConfirmed = Boolean(
          user.email_confirmed_at || user.user_metadata?.email_verified
        );
        if (!isEmailConfirmed) {
          return { message: m.auth.emailConfirmationSent };
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) {
          return {
            message: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요.",
          };
        }

        const bootstrapRes = await fetch("/api/auth/bootstrap", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (!bootstrapRes.ok) {
          const bootstrapJson = await bootstrapRes.json().catch(() => ({}));
          return {
            message:
              bootstrapJson?.error ??
              "계정 초기화에 실패했습니다. 다시 시도해 주세요.",
          };
        }

        setIsOpenLoginModal(false);
        router.push("/invitation");
        return null;
      } catch (error) {
        console.error("[auth] signInWithPassword unexpected error", error);
        if (error instanceof Error && error.message) {
          return { message: error.message };
        }
        return { message: m.auth.invalidAccount };
      }
    },
    [m.auth.emailConfirmationSent, m.auth.invalidAccount]
  );

  const handlePricingPlanClick = useCallback(
    (_plan: string, _billing: Billing) => {
      setIsOpenLoginModal(true);
    },
    []
  );

  const handleHeaderStartClick = useCallback(() => {
    setIsOpenLoginModal(true);
  }, []);

  return (
    <>
      <Head>
        <title>{seoMeta.title}</title>
        <meta name="description" content={seoMeta.description} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
      </Head>

      <main className="min-h-screen font-inter text-white bg-black w-screen">
        {isOpenLoginModal && (
          <LoginModal
            open={isOpenLoginModal}
            onClose={handleCloseLoginModal}
            onGoogle={login}
            onConfirm={customLogin}
            language={locale}
          />
        )}

        <LandingHeader
          onStartClick={handleHeaderStartClick}
          startButtonLabel={m.companyLanding.startButton}
        />

        <div className="h-14 md:h-20" />
        <PricingSection onClick={handlePricingPlanClick} />

        <section
          id="pricing-faq"
          className="w-full bg-black text-white mt-32 pb-24 md:pb-32"
        >
          <Animate>
            <BaseSectionLayout>
              <div className="flex flex-col items-center justify-center w-full pt-4">
                <Head1 as="h2" className="text-white text-center">
                  {m.companyLanding.pricingFaq.title}
                </Head1>
                <div className="flex flex-col items-start justify-start text-white/70 font-light w-full mt-10 px-4 md:px-0">
                  {m.companyLanding.pricingFaq.items.map((item, index) => (
                    <QuestionAnswer
                      key={item.question}
                      question={item.question}
                      answer={item.answer}
                      index={index}
                      length={m.companyLanding.pricingFaq.items.length}
                    />
                  ))}
                </div>
              </div>
            </BaseSectionLayout>
          </Animate>
        </section>
        <div>
          <div className="mt-24 text-white/70 font-light text-center mb-40 flex flex-col items-center justify-center">
            추가 문의 사항이 있으시다면, chris@matchharper.com으로 문의해
            주세요.
            <div
              className="mt-2 underline decoration-dotted cursor-pointer text-hgray800 hover:text-hgray1000"
              onClick={() =>
                window.open(
                  "https://peat-find-598.notion.site/Refund-policy-2e684af768c6800e8276ccbe16fc8cb4?pvs=74",
                  "_blank"
                )
              }
            >
              환불 규정
            </div>
          </div>
        </div>
        <Footer />
      </main>
    </>
  );
}
