import Head from "next/head";
import NotFoundPage from "@/components/landing/NotFoundPage";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";

export default function Custom404Page() {
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });

  return (
    <>
      <Head>
        <title>404 | Harper</title>
        <meta name="robots" content="noindex" />
      </Head>

      <NotFoundPage
        careerStartHref={careerStartHref}
        onCareerStartClick={handleCareerStartClick}
      />
    </>
  );
}
