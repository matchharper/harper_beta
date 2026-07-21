import Link from "next/link";
import Head from "next/head";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Download, Printer } from "lucide-react";
import { useState } from "react";
import type { VersionedLegalDocument } from "@/lib/legalDocs.server";
import { Button } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/talentNetworkReferral";
import { showToast } from "@/components/toast/toast";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import CareerAppBar from "@/components/landing/career/CareerAppBarNew";
import { useCareerLandingStart } from "@/hooks/useCareerLandingStart";

export type VersionedLegalDocumentPageProps = {
  document: VersionedLegalDocument;
  landingChrome?: boolean;
};

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-[24px] font-medium leading-tight tracking-normal text-neutral-primary sm:text-[32px]">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-10 border-t border-neutral-1000-a05 pt-8 text-[20px] font-medium leading-7 text-neutral-primary">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 text-[16px] font-normal leading-6 text-neutral-primary">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="mt-4 text-[15px] leading-7 text-neutral-muted">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-7 text-neutral-muted">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-7 text-neutral-muted">
      {children}
    </ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      className="text-link underline underline-offset-2"
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-1000-a05">
      <table className="min-w-full divide-y divide-neutral-1000-a05 text-left text-[13px]">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="bg-bg-weak px-3 py-2 font-medium text-neutral-primary">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-t border-neutral-1000-a05 px-3 py-2 align-top text-neutral-muted">
      {children}
    </td>
  ),
};

export default function VersionedLegalDocumentPage({
  document,
  landingChrome = false,
}: VersionedLegalDocumentPageProps) {
  const [copying, setCopying] = useState(false);
  const { careerStartHref, handleCareerStartClick } = useCareerLandingStart({
    trackingEnabled: false,
  });
  const documentLocale = document.locale;

  const handleCopy = async () => {
    setCopying(true);
    try {
      await copyTextToClipboard(document.body);
      showToast({ message: "문서 내용이 복사되었습니다.", variant: "white" });
    } catch {
      showToast({ message: "복사에 실패했습니다.", variant: "error" });
    } finally {
      window.setTimeout(() => setCopying(false), 800);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <main className="min-h-screen bg-bg-default text-neutral-primary">
      <Head>
        <title>{document.title} | Harper</title>
        {document.description ? (
          <meta name="description" content={document.description} />
        ) : null}
      </Head>
      {landingChrome ? (
        <CareerAppBar
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={documentLocale}
          sectionHrefPrefix="/"
        />
      ) : (
        <header className="border-b border-neutral-1000-a05 bg-bg-default">
          <div className="mx-auto flex max-w-[1120px] items-center justify-between px-4 py-4 sm:px-6">
            <Link
              href="/"
              className="font-hedvig text-[18px] text-neutral-primary"
            >
              Harper
            </Link>
            <Link href="/career" className="text-[13px] text-neutral-muted">
              Career
            </Link>
          </div>
        </header>
      )}

      <div
        className={`flex flex-col gap-20 mx-auto max-w-[1240px] px-4 sm:px-6 ${
          landingChrome ? "pt-24 lg:pt-38" : "pt-10 lg:pt-14"
        }`}
      >
        <div className="flex flex-col gap-4 font-normal">
          <h1 className="max-w-[900px] text-[30px] font-normal leading-[1.2] tracking-normal text-neutral-primary sm:text-[48px] lg:text-[56px]">
            {document.title}
          </h1>
          {document.description ? (
            <div className="max-w-[720px] text-[14px] leading-6 text-neutral-muted sm:text-[16px]">
              {document.description}
            </div>
          ) : null}
        </div>

        <div
          className={`mx-auto grid gap-16 pb-10 lg:grid-cols-[240px_1fr] lg:pb-14`}
        >
          <aside
            className={`lg:sticky lg:h-fit ${
              landingChrome ? "lg:top-24" : "lg:top-8"
            }`}
          >
            <div className="border-b border-neutral-1000/2 pb-4 lg:border lg:p-3 rounded-sm lg:bg-bg-basement">
              <div className="text-[13px] leading-5 text-primary">
                Version {document.version}
              </div>
              <div className="mt-1 text-[13px] leading-5 text-neutral-soft">
                Effective {document.effectiveDate}
              </div>
              <div className="mt-5 flex flex-wrap gap-2 lg:flex-col">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => void handleCopy()}
                  className="justify-start font-normal text-[13px] rounded-sm"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copying ? "Copied" : "Take a copy"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handlePrint}
                  className="justify-start font-normal text-[13px] rounded-sm"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={handlePrint}
                  className="justify-start font-normal text-[13px] rounded-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Save as PDF
                </Button>
              </div>
              <p className="mt-5 text-[12px] leading-5 text-neutral-soft">
                문의:{" "}
                <a
                  href={`mailto:${document.contactEmail}`}
                  className="text-link underline underline-offset-2"
                >
                  {document.contactEmail}
                </a>
              </p>
            </div>
          </aside>

          <article className="min-w-0 rounded-lg">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {document.body}
            </ReactMarkdown>
          </article>
        </div>
      </div>
      {landingChrome ? (
        <CareerLandingFooter
          careerStartHref={careerStartHref}
          onCareerStartClick={handleCareerStartClick}
          locale={documentLocale}
          showLocaleSwitcher={false}
        />
      ) : null}
    </main>
  );
}
