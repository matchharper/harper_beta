import {
  Ellipsis,
  Eye,
  EyeOff,
  File,
  FileImage,
  Files,
  FileSpreadsheet,
  FileText,
  FileType2,
  Pencil,
  Plus,
  Presentation,
  Star,
  Trash2,
} from "lucide-react";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import type { CareerTalentDocument } from "@/components/career/types";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/components/ui/action-dropdown";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/panel";
import { useCareerT } from "@/i18n/useCareerT";
import { useMessages } from "@/i18n/useMessage";
import { formatCareerDate } from "@/lib/career/dateFormat";
import {
  getCareerDocumentFormat,
  type CareerDocumentFormat,
} from "@/lib/career/documentFormat";

type CareerDocumentsSettingsSectionProps = {
  documents: CareerTalentDocument[];
  onAddDocument: () => void;
  onDeleteDocument: (documentId: string) => void;
  onRenameDocument: (document: CareerTalentDocument) => void;
};

const DOCUMENT_FORMAT_ICONS: Record<CareerDocumentFormat, typeof File> = {
  document: FileText,
  image: FileImage,
  pdf: FileType2,
  presentation: Presentation,
  spreadsheet: FileSpreadsheet,
  unknown: File,
};

const CareerDocumentFormatIcon = ({ fileName }: { fileName: string }) => {
  const Icon = DOCUMENT_FORMAT_ICONS[getCareerDocumentFormat(fileName)];

  return (
    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-neutral-muted" />
  );
};

const CareerDocumentsSettingsSection = ({
  documents,
  onAddDocument,
  onDeleteDocument,
  onRenameDocument,
}: CareerDocumentsSettingsSectionProps) => {
  const t = useCareerT();
  const { locale } = useMessages();
  const { profileSavePending, onUpdateTalentDocument } =
    useCareerProfileContext();

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <FieldLabel
          icon={<Files className="h-4 w-4" />}
          label={t("career.profile.documents.title", "내 문서")}
        />
        <MuteButton
          type="button"
          size="sm"
          onClick={onAddDocument}
          disabled={profileSavePending}
        >
          <Plus className="h-3.5 w-3.5" />
          {t("career.profile.documents.add", "추가하기")}
        </MuteButton>
      </div>
      {documents.length > 0 ? (
        <div className="mt-2 grid gap-2">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex items-center gap-3 rounded-md border border-neutral-1000-a05 bg-bg-floating px-4 py-3 shadow-sm"
            >
              <CareerDocumentFormatIcon fileName={document.fileName} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  {document.downloadUrl ? (
                    <a
                      href={document.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-sm text-link underline underline-offset-2"
                    >
                      {document.fileName}
                    </a>
                  ) : (
                    <p className="min-w-0 truncate text-sm text-neutral-primary">
                      {document.fileName}
                    </p>
                  )}
                  {document.kind === "document" ? (
                    <Badge
                      size="sm"
                      tone={document.isPublic ? "positive" : "neutral"}
                      variant="faded"
                    >
                      {document.isPublic
                        ? t("career.profile.documents.public", "회사 공개")
                        : t("career.profile.documents.private", "비공개")}
                    </Badge>
                  ) : (
                    <Badge size="sm" variant="faded">
                      {t("career.profile.documents.kind.resume", "이력서")}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-neutral-soft">
                  {formatCareerDate(document.createdAt, locale)}
                </p>
              </div>
              <ActionDropdown
                align="end"
                trigger={
                  <MuteButton
                    type="button"
                    variant="transparent"
                    size="sm"
                    disabled={profileSavePending}
                    aria-label={t(
                      "career.profile.documents.actions",
                      "문서 메뉴"
                    )}
                  >
                    <Ellipsis className="h-4 w-4" />
                  </MuteButton>
                }
              >
                {document.kind === "resume" ? (
                  <ActionDropdownItem
                    onSelect={() =>
                      void onUpdateTalentDocument(document.id, {
                        isPrimary: true,
                      })
                    }
                  >
                    <Star className="h-4 w-4" />
                    {t(
                      "career.profile.documents.set_primary",
                      "대표 이력서로 지정"
                    )}
                  </ActionDropdownItem>
                ) : (
                  <ActionDropdownItem
                    onSelect={() =>
                      void onUpdateTalentDocument(document.id, {
                        isPublic: !document.isPublic,
                      })
                    }
                  >
                    {document.isPublic ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    {document.isPublic
                      ? t(
                          "career.profile.documents.make_private",
                          "비공개로 전환"
                        )
                      : t("career.profile.documents.make_public", "공개하기")}
                  </ActionDropdownItem>
                )}
                <ActionDropdownItem onSelect={() => onRenameDocument(document)}>
                  <Pencil className="h-4 w-4" />
                  {t("career.profile.documents.rename", "이름 수정")}
                </ActionDropdownItem>
                <ActionDropdownSeparator />
                <ActionDropdownItem
                  tone="danger"
                  onSelect={() => onDeleteDocument(document.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("career.profile.documents.delete", "문서 삭제")}
                </ActionDropdownItem>
              </ActionDropdown>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-neutral-soft">
          {t(
            "career.profile.documents.empty",
            "추가로 저장된 문서가 없습니다."
          )}
        </p>
      )}
    </div>
  );
};

export default CareerDocumentsSettingsSection;
