import { useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import type { Locale } from "@/i18n/useMessage";
import {
  CompanyTalentLogoTile,
  companySocialProofCopy,
  companyTalentLogos,
} from "@/components/landing/CompanySocialProof";
import styles from "./PricingSocialProof.module.css";

const sectionTitle =
  "text-center text-[16px] font-normal leading-snug tracking-tight md:text-[20px]";

export function PricingSocialProof({ locale }: { locale: Locale }) {
  const [paused, setPaused] = useState(false);
  const c = (ko: string, en: string) => (locale === "ko" ? ko : en);

  return (
    <div className="mt-24 space-y-20 md:mt-32 md:space-y-28">
      <section aria-labelledby="pricing-teams-title">
        <h2 id="pricing-teams-title" className={sectionTitle}>
          {c("이 팀들과 함께합니다", "Working with these teams")}
        </h2>
        <ul className="mx-auto mt-8 grid max-w-[880px] grid-cols-2 items-center gap-x-9 gap-y-8 py-5 sm:flex sm:justify-center sm:gap-12 md:mt-10 md:gap-16">
          <li className="flex min-w-0 items-center justify-center sm:w-[124px]">
            <Image
              src="/images/wonderful.png"
              alt="Wonderful"
              width={104}
              height={73}
              className="h-auto w-full"
            />
          </li>
          <li className="flex min-w-0 items-center justify-center sm:w-[106px]">
            <Image
              src="/images/logos/sierra.svg"
              alt="Sierra"
              width={106}
              height={54}
              className="h-auto w-full"
            />
          </li>
          <li className="col-span-2 text-center text-[15px] font-light text-neutral-muted">
            {c("and 10+개의 비공개 회사", "and 10+undisclosed companies")}
          </li>
        </ul>
      </section>

      <section aria-labelledby="pricing-talent-title">
        <div className="relative px-11">
          <h2 id="pricing-talent-title" className={sectionTitle}>
            {c("이곳의 인재들이 신뢰합니다", "Trusted by talent from")}
          </h2>
        </div>
        <div
          id="pricing-talent-logos"
          role="region"
          aria-labelledby="pricing-talent-title"
          tabIndex={0}
          className={`${styles.viewport} mt-8 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-800 md:mt-10`}
        >
          <div className={styles.track} data-paused={paused}>
            {[false, true].map((duplicate) => (
              <ul
                key={String(duplicate)}
                aria-hidden={duplicate || undefined}
                className="flex shrink-0 gap-2 pr-2"
              >
                {companyTalentLogos.map((logo) => (
                  <li
                    key={logo.name}
                    className="h-20 w-36 shrink-0 md:h-24 md:w-40"
                  >
                    <CompanyTalentLogoTile logo={logo} />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="pricing-testimonial-title"
        className="flex flex-col items-center justify-center"
      >
        <h2 id="pricing-testimonial-title" className={sectionTitle}></h2>
        <figure className="mt-8 rounded-sm border border-neutral-200 bg-neutral-200/80 px-6 py-9 md:max-w-[640px] md:mt-10 md:p-12">
          <blockquote className="text-[16px] font-medium leading-[1.6] text-neutral-primary [word-break:keep-all] md:text-[20px]">
            <p>“{companySocialProofCopy[locale].testimonial}”</p>
          </blockquote>
          <figcaption className="mt-8 flex items-center gap-3 md:mt-10">
            <Image
              src="/images/logos/wonderful.jpg"
              alt="Wonderful"
              width={48}
              height={48}
              className="h-12 w-12 rounded-full bg-neutral-00 object-contain p-2"
            />
            <div>
              <p className="text-[15px] font-medium">General Manager</p>
              <p className="mt-0.5 text-[14px] font-light text-neutral-muted">
                at $5B AI Company
              </p>
            </div>
          </figcaption>
        </figure>
      </section>
    </div>
  );
}
