import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { ArrowRight, Check } from "lucide-react";
import Face from "@/components/common/Face";
import { MuteButton } from "@/components/ui/button";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import { MessagesProvider, type Locale } from "@/i18n/useMessage";
import {
  COMPANY_CONCEPTS,
  conceptMetadata,
  companyConceptStyles as styles,
} from "@/components/landing/company-preview/CompanyLandingConcepts";

export default function CompanyConceptGallery({ locale }: { locale: Locale }) {
  const ko = locale === "ko";
  return (
    <MessagesProvider locale={locale}>
      <Head>
        <title>Harper · Company Landing Concepts</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <CareerAppBar
        // primaryActionLabel={ko ? "무료로 시작하기" : "Start for free"}
        // careerStartHref={`/org?lang=${locale}`}
        careerStartHref={`/${locale}/company#company-contact`}
        showSectionLinks={false}
        audienceHref="/"
        locale={locale}
      />
      <main id="top" className={styles.hub}>
        <div className={styles.hubInner}>
          <div className={styles.hubNav}>
            <span className={styles.hubWordmark}>Company / Concepts</span>
            <MuteButton asChild variant="transparent" size="sm">
              <Link href={`/company/preview?lang=${ko ? "en" : "ko"}`}>
                {ko ? "English" : "한국어"}
              </Link>
            </MuteButton>
          </div>
          <div className={styles.hubIntro}>
            <div>
              <div className={styles.eyebrow}>
                THREE DIRECTIONS · OCTOBER 2026
              </div>
              <h1>
                {ko ? "같은 Harper," : "One Harper."}
                <br />
                {ko
                  ? "시작되는 이야기는 다르게."
                  : "Three ways to tell the story."}
              </h1>
            </div>
            <p>
              {ko
                ? "기존 섹션은 유지하고, 각 안에 네 개의 섹션을 더했습니다. 공감과 발견, 채용 업무의 위임, 판단의 근거. 어떤 이야기가 우리 고객을 가장 잘 움직일지 비교해 보세요."
                : "The existing sections stay. Each concept adds four sections around a different idea: discovering people, sharing the hiring work, or understanding a match. Explore the story that best fits your customers."}
            </p>
          </div>
          <div className={styles.conceptCards}>
            {COMPANY_CONCEPTS.map((id) => {
              const copy = conceptMetadata[id][locale];
              return (
                <article key={id} className={styles.conceptCard}>
                  <div
                    aria-hidden="true"
                    className={`${styles.conceptThumbnail} ${id === "1" ? styles.thumbnailOne : id === "3" ? styles.thumbnailThree : ""}`}
                  >
                    {id === "1" ? (
                      <>
                        <div className={styles.thumbnailPaper}>
                          {ko ? "지금까지 해온 일" : "The career so far"}
                          <br />
                          <span className={styles.microLabel}>
                            Product Engineer · 0 → 1
                          </span>
                        </div>
                        <div className={styles.thumbnailPaper}>
                          {ko ? "다음에 하고 싶은 일" : "The chapter ahead"} ↗
                          <br />
                          <span className={styles.microLabel}>
                            {ko
                              ? "사용자 가까이, 더 큰 책임"
                              : "Closer to users. More ownership."}
                          </span>
                        </div>
                      </>
                    ) : id === "2" ? (
                      <>
                        {[
                          ko ? "역할의 기준 정리" : "Shape the role",
                          ko ? "후보자의 경험 검토" : "Review the experience",
                          ko ? "기회 소개와 대화" : "Start the conversation",
                        ].map((title) => (
                          <div key={title} className={styles.thumbnailWork}>
                            {title}
                            <Check size={14} className={styles.accent} />
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <div className={styles.thumbnailLens}>
                          <Face size={54} />
                          <span>Context → Connection</span>
                        </div>
                        <span className={styles.thumbnailContext}>
                          {ko ? "이 사람을 만나볼 이유" : "A reason to meet"}
                        </span>
                      </>
                    )}
                  </div>
                  <div className={styles.conceptCardBody}>
                    <div className={styles.conceptCardMeta}>
                      <span>CONCEPT 0{id}</span>
                      <span>{ko ? "추가 섹션 4개" : "4 new sections"}</span>
                    </div>
                    <h2>{copy.name}</h2>
                    <span className={`${styles.microLabel} mt-2`}>
                      {copy.theme}
                    </span>
                    <p>{copy.description}</p>
                    <MuteButton asChild variant="dark" size="lg">
                      <Link href={`/company/preview/${id}?lang=${locale}`}>
                        {ko ? "이 버전 보기" : "Explore concept"}
                        <ArrowRight className="ml-3" />
                      </Link>
                    </MuteButton>
                  </div>
                </article>
              );
            })}
          </div>
          <div className={styles.hubFoot}>
            <p>
              <Link href="/company/preview/rationale">
                {ko
                  ? "어떤 내용을 왜 넣었는지 · 분석 문서 읽기"
                  : "Why each section is here · Read the design rationale"}{" "}
                ↗
              </Link>
              <br />
              {ko
                ? "후보자와 대화는 가상 예시이며, 실제 연락이나 데이터 변경을 수행하지 않습니다."
                : "New candidates and conversations are fictional examples. Preview interactions don’t send messages or change candidate data."}
            </p>
            <Link href={`/${locale}/company`}>
              {ko ? "현재 페이지와 비교하기" : "Compare with the current page"}{" "}
              ↗
            </Link>
          </div>
        </div>
      </main>
    </MessagesProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async ({
  query,
  res,
}) => {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Cache-Control", "private, no-store");
  return { props: { locale: query.lang === "en" ? "en" : "ko" } };
};
