import { ArrowUpRight, FileText } from "lucide-react";
import { useRouter } from "next/router";
import { CardButton } from "@/components/ui/button";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import { useCareerT } from "@/i18n/useCareerT";
import type { CareerDocumentLink } from "@/lib/career/documentLinks";

export function DocumentPreviewCards({
  documents,
}: {
  documents: CareerDocumentLink[];
}) {
  const t = useCareerT();
  const router = useRouter();
  if (!documents.length) return null;
  return (
    <div className="my-4 flex max-w-full flex-wrap gap-3">
      {documents.map((document) => (
        <CardButton
          key={document.id}
          onClick={() => void router.push(getCareerDocumentHref(document.id))}
          className="group w-full max-w-[360px] gap-3"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-bg-weak">
            <FileText className="h-5 w-5 text-neutral-primary" />
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block break-words text-sm font-medium text-neutral-primary">
              {document.title}
            </span>
            <span className="block text-xs font-normal text-neutral-muted">
              {t("career.chat.documents.open", "문서 열기 · 복사 및 내보내기")}
            </span>
          </span>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-primary" />
        </CardButton>
      ))}
    </div>
  );
}
