import Head from "next/head";
import { useState } from "react";
import {
  GMAIL_ANIMATION_VARIANTS,
  GmailConnectionAnimation,
  type GmailAnimationVariant,
} from "@/components/career/settings/GmailConnectionAnimation";
import GmailConnectionSuccessModal from "@/components/career/settings/GmailConnectionSuccessModal";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

export default function GmailAnimationPreviewPage() {
  const t = useCareerT();
  const [selected, setSelected] = useState<GmailAnimationVariant | null>(null);

  return (
    <>
      <Head>
        <title>Gmail × Harper</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="min-h-screen bg-bg-basement px-5 py-16 text-neutral-primary sm:px-8 sm:py-24">
        <div className="mx-auto max-w-[1120px]">
          <p className="text-xs tracking-[0.16em] text-neutral-soft">01 — 03</p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight">
            Gmail × Harper
          </h1>
          <p className="mt-3 text-sm text-neutral-muted">
            {t(
              "career.profile.career_profile_links_settings_section.12rthh0",
              "읽어오기를 누르면 Harper가 최근 커리어 관련 이메일을 정리합니다."
            )}
          </p>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {GMAIL_ANIMATION_VARIANTS.map((variant, index) => (
              <section
                key={variant}
                className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating px-4 py-6"
              >
                <p className="text-center text-xs tabular-nums text-neutral-soft">{`0${index + 1}`}</p>
                <GmailConnectionAnimation variant={variant} />
                <div className="mt-4 flex justify-center">
                  <MuteButton onClick={() => setSelected(variant)}>
                    {t(
                      "career.profile.career_profile_links_settings_section.0eons0f",
                      "모달 보기"
                    )}
                  </MuteButton>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
      {selected ? (
        <GmailConnectionSuccessModal
          key={selected}
          open
          pending={false}
          animationVariant={selected}
          onClose={() => setSelected(null)}
          onImport={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

export async function getServerSideProps() {
  if (process.env.NODE_ENV === "production") {
    return { notFound: true };
  }
  return { props: {} };
}
