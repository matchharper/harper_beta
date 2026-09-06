import { useEffect, useMemo, useState } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { useCareerProfileContext } from "@/components/career/CareerSidebarContext";
import LoadingState from "@/components/career/OnboardingLoadingState";
import ProfileSourceApplyConfirmModal, {
  type ProfileSourceApplyConfirmMode,
} from "@/components/career/profile/ProfileSourceApplyConfirmModal";
import {
  CareerAddDocumentModal,
  CareerCallNoteModal,
  CareerDocumentDeleteModal,
  CareerDocumentRenameModal,
  type CareerDocumentUploadResult,
  CareerDocumentVisibilityModal,
} from "@/components/career/settings/CareerDocumentSettingsModals";
import CareerDocumentsSettingsSection from "@/components/career/settings/CareerDocumentsSettingsSection";
import CareerProfileLinksSettingsSection from "@/components/career/settings/CareerProfileLinksSettingsSection";
import CareerSavedResumeSettingsSection from "@/components/career/settings/CareerSavedResumeSettingsSection";
import type { CareerTalentDocument } from "@/components/career/types";
import { pickLinkedinProfileLink } from "@/hooks/career/careerHelpers";
import { useCareerLogEvent } from "@/hooks/career/useCareerLogEvent";
import { useCareerT } from "@/i18n/useCareerT";

const findDocumentById = (
  documents: CareerTalentDocument[],
  documentId: string | null
) => documents.find((document) => document.id === documentId) ?? null;

const CareerResumeLinksSettingsSection = () => {
  const t = useCareerT();
  const logCareerEvent = useCareerLogEvent();
  const {
    talentDocuments,
    profileLinks,
    savedProfileLinks,
    profileSavePending,
    onSaveTalentProfile,
    onRefreshTalentProfileSources,
  } = useCareerProfileContext();
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
  const [callNoteDocumentId, setCallNoteDocumentId] = useState<string | null>(
    null
  );
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

  const primaryResumeDocument = useMemo(
    () =>
      talentDocuments.find(
        (document) => document.kind === "resume" && document.isPrimary
      ) ??
      talentDocuments.find((document) => document.kind === "resume") ??
      null,
    [talentDocuments]
  );
  const remainingDocuments = useMemo(
    () =>
      talentDocuments.filter(
        (document) => document.id !== primaryResumeDocument?.id
      ),
    [primaryResumeDocument?.id, talentDocuments]
  );
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
  const callNoteDocument = useMemo(
    () => findDocumentById(talentDocuments, callNoteDocumentId),
    [callNoteDocumentId, talentDocuments]
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
      await onRefreshTalentProfileSources({ links: savedProfileLinks });
    } finally {
      setIsProcessingSourceUpdate(false);
    }
  };

  const openDocumentRename = (document: CareerTalentDocument) => {
    setDocumentPendingRenameId(document.id);
  };

  return (
    <div className="pb-24">
      <CareerSavedResumeSettingsSection
        primaryResumeDocument={primaryResumeDocument}
        onRenameDocument={openDocumentRename}
        onDeleteDocument={setDocumentPendingDeleteId}
        onUploadComplete={handleResumeUploadComplete}
      />

      <CareerProfileLinksSettingsSection
        hasUnsavedChanges={hasUnsavedLinkChanges}
        onLinkedinRefresh={handleLinkedinRefresh}
        onSave={() => void handleSaveLinks()}
      />

      <CareerDocumentsSettingsSection
        documents={remainingDocuments}
        onAddDocument={() => setAddDocumentOpen(true)}
        onOpenCallNote={(document) => setCallNoteDocumentId(document.id)}
        onRenameDocument={openDocumentRename}
        onDeleteDocument={setDocumentPendingDeleteId}
      />

      <CareerCallNoteModal
        document={callNoteDocument}
        onClose={() => setCallNoteDocumentId(null)}
      />

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
        panelClassName="max-w-none w-[min(1080px,94vw)] max-h-[92svh] border-0 bg-bg-floating/40"
        bodyClassName="max-h-[92svh] overflow-y-auto py-0"
      >
        <LoadingState isOnboarding={false} />
      </TalentCareerModal>
    </div>
  );
};

export default CareerResumeLinksSettingsSection;
