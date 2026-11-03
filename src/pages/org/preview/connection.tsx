import Head from "next/head";
import { ReviewEmptyState } from "@/components/org/OrgHomeInbox";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";

export default function PendingConnectionPreviewPage() {
  const { c } = useOrgLocale();
  return (
    <>
      <Head>
        <title>Harper · Ready to connect preview</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <main className="min-h-screen bg-bg-default px-5 py-6 text-neutral-primary sm:px-10">
        <div className="mx-auto max-w-[1040px]">
          <p className="border-b border-neutral-1000-a05 pb-4 text-sm">
            {c("연결 수락한 후보", "Ready to connect")}
          </p>
          <ReviewEmptyState />
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps() {
  if (process.env.NODE_ENV === "production") return { notFound: true };
  return { props: {} };
}
