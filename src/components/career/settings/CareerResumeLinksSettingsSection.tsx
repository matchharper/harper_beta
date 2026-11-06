import { ResumeTextRecovery } from "@/components/career/ResumeTextRecovery";
import { useEffect, useMemo, useState } from "react";
import { Plug } from "lucide-react";
import { FieldLabel } from "@/components/ui/panel";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import LoadingState from "@/components/career/OnboardingLoadingState";
import ProfileSourceApplyConfirmModal, {
  type ProfileSourceApplyConfirmMode,
} from "@/components/career/profile/ProfileSourceApplyConfirmModal";
import {
  CareerAddDocumentModal,
  CareerDocumentDeleteModal,
  CareerGmailHistoryEditPanel,
  CareerDocumentRenameModal,
  type CareerDocumentUploadResult,
  CareerDocumentVisibilityModal,
} from "@/components/career/settings/CareerDocumentSettingsModals";
import CareerDocumentsSettingsSection from "@/components/career/settings/CareerDocumentsSettingsSection";
import CareerProfileLinksSettingsSection from "@/components/career/settings/CareerProfileLinksSettingsSection";
import CareerGmailSettingsRow from "@/components/career/settings/CareerGmailSettingsRow";
import { CareerDocumentDetail } from "@/components/career/documents/CareerDocumentDetail";
import CareerCallNoteDetail from "@/components/career/profile/CareerCallNoteDetail";
import type { CareerTalentDocument } from "@/components/career/types";
import { pickLinkedinProfileLink } from "@/hooks/career/careerHelpers";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";

const findDocumentById = (
  documents: CareerTalentDocument[],
  documentId: string | null
) => documents.find((document) => document.id === documentId) ?? null;

const CareerResumeLinksSettingsSection = ({
  onOpenCallNote,
  onOpenDocument,
}: {
  onOpenCallNote?: (document: CareerTalentDocument) => void;
  onOpenDocument?: (document: CareerTalentDocument) => void;
}) => {
  const t = useCareerT();
  const [resumeRecovery, setResumeRecovery] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const logCareerEvent = useCareerLogEvent();
  const {
    talentDocuments,
    profileLinks,
    savedProfileLinks,
    profileSavePending,
    onSaveTalentProfile,
    onRefreshTalentProfileSources,
  } = useCareerProfileContext();
  const [inlineDocument, setInlineDocument] =
    useState<CareerTalentDocument | null>(null);
  const [isProcessingSourceUpdate, setIsProcessingSourceUpdate] =
    useState(false);
  const [sourceApplyConfirmMode, setSourceApplyConfirmMode] =
    useState<ProfileSourceApplyConfirmMode | null>(null);
  const [documentPendingDeleteId, setDocumentPendingDeleteId] = useState<
    string | null
  >(null);
  const [addDocumentOpen, setAddDocumentOpen] = useState(false);
  const [visibilityPromptDocumentId, setVisibilityPromptDocumentId] = useState<
    string | null
  >(null);
  const [documentPendingRenameId, setDocumentPendingRenameId] = useState<
    string | null
  >(null);
  const [inlineCallNoteDocumentId, setInlineCallNoteDocumentId] = useState<
    string | null
  >(null);
  const [documentPendingEditId, setDocumentPendingEditId] = useState<
    string | null
  >(null);
  const [pendingPostUploadDialog, setPendingPostUploadDialog] =
    useState<CareerDocumentUploadResult | null>(null);

  useEffect(() => {
    if (
      !pendingPostUploadDialog ||
      addDocumentOpen ||
      isProcessingSourceUpdate ||
      profileSavePending
    ) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      if (pendingPostUploadDialog.type === "profile_apply") {
        setSourceApplyConfirmMode("saved_sources");
      } else {
        setVisibilityPromptDocumentId(pendingPostUploadDialog.documentId);
      }
      setPendingPostUploadDialog(null);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    addDocumentOpen,
    isProcessingSourceUpdate,
    pendingPostUploadDialog,
    profileSavePending,
  ]);

  const hasUnsavedLinkChanges = useMemo(() => {
    if (profileLinks.length !== savedProfileLinks.length) return true;

    return profileLinks.some(
      (link, index) => link.trim() !== (savedProfileLinks[index] ?? "").trim()
    );
  }, [profileLinks, savedProfileLinks]);

  const hasLinkedinChange = useMemo(() => {
    const previousLinkedinUrl = pickLinkedinProfileLink(savedProfileLinks);
    const nextLinkedinUrl = pickLinkedinProfileLink(profileLinks);
    return Boolean(nextLinkedinUrl && nextLinkedinUrl !== previousLinkedinUrl);
  }, [profileLinks, savedProfileLinks]);

  const documentPendingDelete = useMemo(
    () => findDocumentById(talentDocuments, documentPendingDeleteId),
    [documentPendingDeleteId, talentDocuments]
  );
  const visibilityPromptDocument = useMemo(
    () => findDocumentById(talentDocuments, visibilityPromptDocumentId),
    [talentDocuments, visibilityPromptDocumentId]
  );
  const documentPendingRename = useMemo(
    () => findDocumentById(talentDocuments, documentPendingRenameId),
    [documentPendingRenameId, talentDocuments]
  );
  const inlineCallNoteDocument = useMemo(() => {
    const document = findDocumentById(
      talentDocuments,
      inlineCallNoteDocumentId
    );
    return document?.kind === "call_note" ? document : null;
  }, [inlineCallNoteDocumentId, talentDocuments]);
  const documentPendingEdit = useMemo(
    () => findDocumentById(talentDocuments, documentPendingEditId),
    [documentPendingEditId, talentDocuments]
  );

  const handleSaveLinks = async () => {
    logCareerEvent("click_resume_links_save");
    const saved = await onSaveTalentProfile({
      applyProfileSources: !hasLinkedinChange,
      persistError: false,
      resumeFile: null,
    });
    if (saved && hasLinkedinChange) {
      setPendingPostUploadDialog({ type: "profile_apply" });
    }
    return Boolean(saved);
  };

  const handleResumeUploadComplete = (requestCompleted: boolean) => {
    if (requestCompleted) return;
    setPendingPostUploadDialog({ type: "profile_apply" });
  };

  const handleLinkedinRefresh = () => {
    logCareerEvent("click_resume_links_refresh_linkedin");
    setSourceApplyConfirmMode("linkedin_refresh");
  };

  const handleConfirmSourceApply = async () => {
    setSourceApplyConfirmMode(null);
    setIsProcessingSourceUpdate(true);
    try {
      const saved = await onRefreshTalentProfileSources({
        links: savedProfileLinks,
      });
      if (!saved) setResumeRecovery(true);
    } finally {
      setIsProcessingSourceUpdate(false);
    }
  };

  const openDocumentRename = (document: CareerTalentDocument) => {
    setDocumentPendingRenameId(document.id);
  };

  const handleOpenCallNote = (document: CareerTalentDocument) => {
    if (onOpenCallNote) {
      onOpenCallNote(document);
      return;
    }
    setInlineCallNoteDocumentId(document.id);
  };

  if (inlineDocument) {
    return (
      <CareerDocumentDetail
        key={inlineDocument.id}
        updatedAt={talentDocuments.find(item => item.id === inlineDocument.id)?.updatedAt}
        document={{ id: inlineDocument.id, title: inlineDocument.fileName }}
        onBack={() => setInlineDocument(null)}
      />
    );
  }

  if (inlineCallNoteDocument) {
    return (
      <CareerCallNoteDetail
        documentId={inlineCallNoteDocument.id}
        document={inlineCallNoteDocument}
        onBack={() => setInlineCallNoteDocumentId(null)}
      />
    );
  }

  return (
    <div className="pb-24">
      <CareerProfileLinksSettingsSection
        hasUnsavedChanges={hasUnsavedLinkChanges}
        onLinkedinRefresh={handleLinkedinRefresh}
        onSave={handleSaveLinks}
      />

      <div className="mt-9">
        <CareerDocumentsSettingsSection
          documents={talentDocuments}
          onAddDocument={() => setAddDocumentOpen(true)}
          onOpenCallNote={handleOpenCallNote}
          onOpenDocument={onOpenDocument ?? setInlineDocument}
          onEditDocument={(document) => setDocumentPendingEditId(document.id)}
          onRenameDocument={openDocumentRename}
          onDeleteDocument={setDocumentPendingDeleteId}
          onUploadComplete={handleResumeUploadComplete}
          onResumeReadFailure={() => setResumeRecovery(true)}
        />
      </div>

      <section className="mt-9">
        <FieldLabel
          icon={<Plug className="h-4 w-4" />}
          label={t(
            "career.profile.sources.connected_services",
            "연결된 서비스"
          )}
        />
        <div className="mt-3 flex flex-wrap gap-3">
          <CareerGmailSettingsRow />
        </div>
      </section>

      <TalentCareerModal
        open={resumeRecovery}
        onClose={() => {
          if (!profileSavePending) setResumeRecovery(false);
        }}
        title={t("career.resume_recovery.dialog", "프로필 가져오기")}
        panelClassName="max-w-[560px]"
        bodyClassName="px-5 py-5"
        closeOnBackdrop={!profileSavePending}
      >
        <ResumeTextRecovery
          value={pastedText}
          onChange={setPastedText}
          pending={profileSavePending}
          onSubmit={() =>
            void (async () => {
              const saved = await onSaveTalentProfile({
                applyProfileSources: true,
                links: savedProfileLinks,
                persistError: false,
                resumeFile: new File([pastedText], "resume.txt", {
                  type: "text/plain",
                }),
              });
              if (saved) {
                setResumeRecovery(false);
                setPastedText("");
              }
            })()
          }
        />
      </TalentCareerModal>

      <ProfileSourceApplyConfirmModal
        mode={sourceApplyConfirmMode}
        pending={false}
        onCancel={() => setSourceApplyConfirmMode(null)}
        onConfirm={handleConfirmSourceApply}
      />

      <CareerAddDocumentModal
        open={addDocumentOpen}
        onClose={() => setAddDocumentOpen(false)}
        onUploadComplete={setPendingPostUploadDialog}
      />
      <CareerDocumentVisibilityModal
        document={visibilityPromptDocument}
        onClose={() => setVisibilityPromptDocumentId(null)}
      />
      <CareerDocumentRenameModal
        document={documentPendingRename}
        onClose={() => setDocumentPendingRenameId(null)}
      />
      <CareerGmailHistoryEditPanel
        document={documentPendingEdit}
        onClose={() => setDocumentPendingEditId(null)}
      />
      <CareerDocumentDeleteModal
        document={documentPendingDelete}
        onClose={() => setDocumentPendingDeleteId(null)}
      />

      <TalentCareerModal
        open={isProcessingSourceUpdate}
        onClose={() => undefined}
        ariaLabel={t("career.common.career.0tmpcjv", "프로필 업데이트 중")}
        closeOnBackdrop={false}
        showCloseButton={false}
        overlayClassName="z-120"
        panelClassName="max-w-none w-[min(1080px,94vw)] max-h-[92svh] border-0 bg-modal/40"
        bodyClassName="max-h-[92svh] overflow-y-auto py-0"
      >
        <LoadingState isOnboarding={false} />
      </TalentCareerModal>
    </div>
  );
};

export default CareerResumeLinksSettingsSection;
