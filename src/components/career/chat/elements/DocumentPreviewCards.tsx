import { FileText } from "lucide-react";
import { useRouter } from "next/router";
import { CardButton } from "@/components/ui/button";
import { getCareerDocumentHref } from "@/lib/career/documentLinks";
import { useCareerMobileChatClose } from "@/components/career/mobile/CareerMobileChatCloseContext";
import type { CareerDocumentLink } from "@/lib/career/documentLinks";
import { useQuery } from "@tanstack/react-query";
import { useCareerApi } from "@/hooks/career/useCareerApi";
import { useAuthStore } from "@/store/useAuthStore";
import { useCareerT } from "@/i18n/useCareerT";

function DocumentPreviewCard({ document }: { document: CareerDocumentLink }) {
  const closeMobileChat = useCareerMobileChatClose();
  const router = useRouter();
  const t = useCareerT();
  const { fetchWithAuth } = useCareerApi();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const { data: metadata } = useQuery({
    queryKey: ["career-document-metadata", userId, document.id],
    enabled: Boolean(userId),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    queryFn: async ({ signal }) => {
      const response = await fetchWithAuth(
        `/api/talent/documents?documentId=${encodeURIComponent(document.id)}`,
        { signal }
      );
      if (!response.ok) throw new Error("Failed to fetch document metadata");
      const payload = (await response.json()) as {
        documents: { kind: string; description: string | null }[];
      };
      const result = payload.documents[0];
      return result
        ? { kind: result.kind, description: result.description }
        : null;
    },
  });

  return (
    <PreviewUI
      onClick={() => {
        closeMobileChat?.();
        void router.push(getCareerDocumentHref(document.id));
      }}
      icon={<FileText className="h-5 w-5 text-neutral-primary/40" />}
      title={document.title}
      description={
        metadata?.description?.trim() ||
        (metadata?.kind === "resume"
          ? t("career.profile.documents.kind.resume", "이력서")
          : t("career.profile.documents.kind.document", "문서"))
      }
    />
  );
}

export const PreviewUI = ({
  onClick,
  icon,
  title,
  description,
  trailing,
  wrapDescription = false,
  disabled = false,
}: {
  onClick?: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  trailing?: React.ReactNode;
  wrapDescription?: boolean;
  disabled?: boolean;
}) => {
  const content = (
    <>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 flex flex-col">
        <span className="block break-words text-sm font-normal text-neutral-primary">
          {title}
        </span>
        <span
          className={`block break-words mt-0.5 text-xs text-neutral-muted font-light ${wrapDescription ? "whitespace-pre-line" : "truncate"}`}
        >
          {description}
        </span>
      </span>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </>
  );
  const className =
    "group w-[320px] max-w-full gap-4 rounded-3xl flex flex-row items-center px-5 bg-surface-tint border-none";
  return onClick ? (
    <CardButton
      onClick={onClick}
      disabled={disabled}
      className={`${className} hover:bg-surface-inverse/8`}
    >
      {content}
    </CardButton>
  ) : (
    <div className={`${className} py-4 text-left`}>{content}</div>
  );
};

export function DocumentPreviewCards({
  documents,
}: {
  documents: CareerDocumentLink[];
}) {
  if (!documents.length) return null;
  return (
    <div className="mt-4 flex max-w-full flex-wrap gap-3">
      {documents.map((document) => (
        <DocumentPreviewCard key={document.id} document={document} />
      ))}
    </div>
  );
}
