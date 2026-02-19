"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function GaPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_ID) return;
    // gtag가 로드되기 전일 수도 있으니 방어
    // @ts-ignore
    if (typeof window.gtag !== "function") return;

    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : "");
    // @ts-ignore
    window.gtag("config", GA_ID, { page_path: url });
  }, [pathname, searchParams]);

  return null;
}
