"use client";

import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function LegacyRequestAccessReviewRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    void router.replace({
      pathname: "/ops/request-access/review",
      query: router.query,
    });
  }, [router, router.isReady, router.query]);

  return (
    <>
      <Head>
        <title>Redirecting To Ops Review</title>
      </Head>
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 text-sm text-neutral-600">
        내부 review 페이지로 이동 중입니다...
      </div>
    </>
  );
}
