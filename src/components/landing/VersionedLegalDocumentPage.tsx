import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Download, Printer } from "lucide-react";
import { useState } from "react";
import type { VersionedLegalDocument } from "@/lib/legalDocs.server";
import { MuteButton } from "@/components/ui/button";
import { copyTextToClipboard } from "@/lib/talentNetworkReferral";
import { showToast } from "@/components/toast/toast";
import DocumentPageShell from "@/components/landing/DocumentPageShell";

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
  const documentLocale = document.locale;
  const copy =
    documentLocale === "ko"
      ? {
          contact: "문의",
          copied: "복사됨",
          copy: "내용 복사",
          copyError: "복사에 실패했습니다.",
          copySuccess: "문서 내용이 복사되었습니다.",
          effective: "시행일",
          print: "인쇄",
          savePdf: "PDF로 저장",
        }
      : {
          contact: "Contact",
          copied: "Copied",
          copy: "Copy document",
          copyError: "Failed to copy the document.",
          copySuccess: "Document copied.",
          effective: "Effective",
          print: "Print",
          savePdf: "Save as PDF",
        };

  const handleCopy = async () => {
    setCopying(true);
    try {
      await copyTextToClipboard(document.body);
      showToast({ message: copy.copySuccess, variant: "white" });
    } catch {
      showToast({ message: copy.copyError, variant: "error" });
    } finally {
      window.setTimeout(() => setCopying(false), 800);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <DocumentPageShell
      title={document.title}
      description={document.description}
      locale={documentLocale}
      landingChrome={landingChrome}
      aside={
        <div className="rounded-sm border-b border-neutral-1000/2 pb-4 lg:border lg:bg-bg-basement lg:p-3">
          <div className="text-[13px] leading-5 text-primary">
            Version {document.version}
          </div>
          <div className="mt-1 text-[13px] leading-5 text-neutral-soft">
            {copy.effective} {document.effectiveDate}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 lg:flex-col">
            <MuteButton
              type="button"
              size="md"
              onClick={() => void handleCopy()}
              className="justify-start"
            >
              <Copy className="h-3.5 w-3.5" />
              {copying ? copy.copied : copy.copy}
            </MuteButton>
            <MuteButton
              type="button"
              size="md"
              onClick={handlePrint}
              className="justify-start"
            >
              <Printer className="h-3.5 w-3.5" />
              {copy.print}
            </MuteButton>
            <MuteButton
              type="button"
              size="md"
              onClick={handlePrint}
              className="justify-start"
            >
              <Download className="h-3.5 w-3.5" />
              {copy.savePdf}
            </MuteButton>
          </div>
          <p className="mt-5 text-[12px] leading-5 text-neutral-soft">
            {copy.contact}:{" "}
            <a
              href={`mailto:${document.contactEmail}`}
              className="text-link underline underline-offset-2"
            >
              {document.contactEmail}
            </a>
          </p>
        </div>
      }
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {document.body}
      </ReactMarkdown>
    </DocumentPageShell>
  );
}
