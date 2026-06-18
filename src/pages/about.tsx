import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";
import Head from "next/head";
import { useEffect, useState } from "react";

const CONTACT_EMAIL = "chris@matchharper.com";

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function AboutPage() {
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });
  const [isEmailCopied, setIsEmailCopied] = useState(false);

  useEffect(() => {
    if (!isEmailCopied) return;

    const timeoutId = window.setTimeout(() => {
      setIsEmailCopied(false);
    }, 1600);

    return () => window.clearTimeout(timeoutId);
  }, [isEmailCopied]);

  const handleCopyEmail = async () => {
    const didCopy = await copyTextToClipboard(CONTACT_EMAIL);
    if (didCopy) setIsEmailCopied(true);
  };

  return (
    <>
      <Head>
        <title>A Note from the Founders - Harper</title>
        <meta
          name="description"
          content="A note from Harper's founders on why Harper was built."
        />
        <link rel="icon" href="/images/logo.ico" />
      </Head>

      <div
        id="top"
        className="min-h-screen font-sans bg-neutral-100 text-neutral-950"
      >
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          sectionHrefPrefix="/"
          bgColor="neutral-100"
        />

        <main className="px-4 pb-24 pt-28 md:px-10 md:pb-[50vh] md:pt-32 min-h-screen">
          <article className="mx-auto max-w-[820px]">
            <p className="font-light mb-2 text-primary text-sm">
              [ A Note from the Founders ]
            </p>
            <h1 className="font-medium">
              You deserve equal access to the best builds on earth.
            </h1>

            <div className="mt-6 text-base max-w-[620px] space-y-6 font-light text-neutral-800">
              <p>
                Having spent over a decade building marketplaces, hiring was
                always the most broken, high-stress bottleneck. Over the last 30
                years, recruitment tools evolved from newspaper classifieds to
                web boards and social networks. The interfaces grew flashier,
                but the primitive mechanism never changed. It remained deeply
                repetitive, draining, and friction-heavy—requiring massive
                cognitive energy just to explore a new move.
              </p>
              <p>
                We realized AI could fundamentally break this paradigm. Harper
                was built to democratize elite leverage. To level the playing
                field for exceptional talent who lack private networks, for
                passive builders who leave their potential unmaximized simply
                because they hate the job search, and for those who only look at
                public indexes like LinkedIn when it’s too late, entirely
                missing the hidden market.
              </p>
              <p>You deserve equal access to the best builds on earth.</p>
              <p className="pt-3 italic text-neutral-950">— Chris & Daniel</p>
            </div>

            <div className="mt-12 max-w-[620px] leading-6 text-[15px] font-light text-neutral-800">
              Founding Engineer, Non-Technical Founding Member를 찾고 있습니다.
              <br />
              저희의 비전에 공감하시는 분들은 아래 이메일로 부담없이 커피챗
              신청해주세요!
              <br />
              <div className="mt-2">
                Contact:{" "}
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="cursor-pointer text-blue-600 transition-colors hover:text-blue-700"
                >
                  {CONTACT_EMAIL}
                </button>
                {isEmailCopied ? (
                  <span className="ml-2 text-[13px] text-neutral-500">
                    Copied
                  </span>
                ) : null}
              </div>
            </div>
          </article>
        </main>

        <CareerLandingFooter
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
        />
      </div>
    </>
  );
}
