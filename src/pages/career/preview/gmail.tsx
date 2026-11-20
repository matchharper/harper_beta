import Head from "next/head";
import GmailPermissionsModal from "@/components/career/settings/GmailPermissionsModal";
import CareerProfileSourceCard from "@/components/career/settings/CareerProfileSourceCard";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";
import { useState } from "react";
import {
  GMAIL_ANIMATION_VARIANTS,
  GmailConnectionAnimation,
} from "@/components/career/settings/GmailConnectionAnimation";
import GmailIntegrationOverview from "@/components/career/integrations/GmailIntegrationOverview";
import { MuteButton } from "@/components/ui/button";
import { useCareerT } from "@/i18n/useCareerT";

export default function GmailAnimationPreviewPage() {
  const t = useCareerT();
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);

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
          <div className="mt-8">
            <CareerProfileSourceCard
              title="Gmail"
              icon={
                <Image
                  src="/images/logos/gmail.svg"
                  alt=""
                  width={22}
                  height={22}
                />
              }
              badge={
                <Badge size="sm" tone="warning" variant="faded">
                  {t(
                    "career.profile.resume_links.gmail_permissions_required",
                    "권한 필요"
                  )}
                </Badge>
              }
              onActivate={() => setPermissionsOpen(true)}
            />
          </div>
          <MuteButton className="mt-4" onClick={() => setOverviewOpen(true)}>
            {t("career.integrations.gmail.continue", "Gmail 연결")}
          </MuteButton>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {GMAIL_ANIMATION_VARIANTS.map((variant, index) => (
              <section
                key={variant}
                className="rounded-2xl border border-neutral-1000-a05 bg-bg-floating px-4 py-6"
              >
                <p className="text-center text-xs tabular-nums text-neutral-soft">{`0${index + 1}`}</p>
                <GmailConnectionAnimation variant={variant} />
              </section>
            ))}
          </div>
        </div>
      </main>
      <GmailPermissionsModal
        open={permissionsOpen}
        busy={false}
        onClose={() => setPermissionsOpen(false)}
        onContinue={() => setPermissionsOpen(false)}
      />
      <GmailIntegrationOverview
        open={overviewOpen}
        pending={false}
        onClose={() => setOverviewOpen(false)}
        onContinue={() => setOverviewOpen(false)}
      />
    </>
  );
}

export async function getServerSideProps() {
  if (process.env.NODE_ENV === "production") {
    return { notFound: true };
  }
  return { props: {} };
}
