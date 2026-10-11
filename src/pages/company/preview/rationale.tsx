import { readFile } from "node:fs/promises";
import path from "node:path";
import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { ArrowLeft } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import RichText from "@/components/ui/rich-text";

export default function CompanyLandingRationale({
  content,
}: {
  content: string;
}) {
  return (
    <main className="min-h-screen bg-bg-basement px-5 py-10 text-neutral-primary md:px-10">
      <Head>
        <title>Harper · Company 랜딩페이지 설계 근거</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <div className="mx-auto max-w-[1060px]">
        <MuteButton asChild variant="transparent">
          <Link href="/company/preview">
            <ArrowLeft className="mr-2" />
            시안 비교로 돌아가기
          </Link>
        </MuteButton>
        <article className="mt-8 border-t border-neutral-1000-a10 pt-8">
          <RichText
            content={content}
            className="text-[15px] leading-7 [&_table]:min-w-[760px]"
          />
        </article>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const content = await readFile(
    path.join(
      process.cwd(),
      "docs/company/company-landing-three-directions-ko.md"
    ),
    "utf8"
  );
  return { props: { content } };
};
