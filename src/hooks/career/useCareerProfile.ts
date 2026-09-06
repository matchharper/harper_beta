import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerCallNote,
  CareerMessage,
  CareerMessagePayload,
  CareerStage,
  CareerTalentEducation,
  CareerTalentDocument,
  CareerTalentExperience,
  CareerTalentExtra,
  CareerTalentProfile,
  CareerTalentUser,
  SessionResponse,
} from "@/components/career/types";
import { showToast } from "@/components/toast/toast";
import {
  compactProfileLinks,
  getErrorMessage,
  isLinkedinLink,
  isLinkedinProfileLink,
  toProfileLinks,
  toUiMessage,
} from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { useMessages } from "@/i18n/useMessage";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";
import { uploadTalentDocument } from "@/lib/talentOnboarding/documentUploadClient";

const showProfileSaveToast = (message: string) => {
  showToast({ message, variant: "white" });
};

const hasInvalidLinkedinProfileInput = (links: string[] = []) => {
  return links.some(
    (link) =>
      Boolean(link?.trim()) &&
      isLinkedinLink(link) &&
      !isLinkedinProfileLink(link)
  );
};

type ProfileIngestionPayload = {
  ok?: boolean;
  error?: string;
  warnings?: Array<{
    code?: string;
    message?: string;
    detail?: string | null;
  }>;
};

const getProfileIngestionWarningMessage = (
  ingestion: ProfileIngestionPayload | null | undefined
) => {
  const warning = ingestion?.warnings?.find(
    (item) => item.code === "linkedin_fetch_failed"
  );
  if (warning?.message) return warning.message;
  return null;
};

const getProfileIngestionFailureMessage = (
  ingestion: ProfileIngestionPayload | null | undefined,
  fallbackMessage: string
) => ingestion?.error ?? fallbackMessage;

type UseCareerProfileArgs = {
  user: User | null;
  conversationId: string | null;
  fetchWithAuth: FetchWithAuth;
  setStage: Dispatch<SetStateAction<CareerStage>>;
  appendMessage: (message: CareerMessage) => void;
  enqueueAssistantTypewriter: (message: CareerMessage) => Promise<void>;
  setChatError: Dispatch<SetStateAction<string>>;
  onMessagesChanged?: (
    messages: CareerMessagePayload[]
  ) => void | Promise<void>;
};

export const useCareerProfile = ({
  user,
  conversationId,
  fetchWithAuth,
  setStage,
  appendMessage,
  enqueueAssistantTypewriter,
  setChatError,
  onMessagesChanged,
}: UseCareerProfileArgs) => {
  const tCareer = useCareerMessageFormatter();
  const { locale } = useMessages();
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [profileLinks, setProfileLinks] = useState<string[]>(() =>
    toProfileLinks()
  );
  const [savedProfileLinks, setSavedProfileLinks] = useState<string[]>(() =>
    toProfileLinks()
  );
  const [profilePending, setProfilePending] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [savedResumeFileName, setSavedResumeFileName] = useState<string | null>(
    null
  );
  const [savedResumeStoragePath, setSavedResumeStoragePath] = useState<
    string | null
  >(null);
  const [savedResumeDownloadUrl, setSavedResumeDownloadUrl] = useState<
    string | null
  >(null);
  const [profileSavePending, setProfileSavePending] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [profileSaveInfo, setProfileSaveInfo] = useState("");
  const [talentUser, setTalentUser] = useState<CareerTalentUser | null>(null);
  const [talentExperiences, setTalentExperiences] = useState<
    CareerTalentExperience[]
  >([]);
  const [talentEducations, setTalentEducations] = useState<
    CareerTalentEducation[]
  >([]);
  const [talentExtras, setTalentExtras] = useState<CareerTalentExtra[]>([]);
  const [talentDocuments, setTalentDocuments] = useState<
    CareerTalentDocument[]
  >([]);

  const getTranslatedProfileIngestionFailureMessage = useCallback(
    (ingestion: ProfileIngestionPayload | null | undefined) =>
      getProfileIngestionFailureMessage(
        ingestion,
        tCareer(H.profileAutoIngestionFailed)
      ),
    [tCareer]
  );

  const applyTalentProfileSnapshot = useCallback(
    (snapshot: SessionResponse["talentProfile"] | undefined) => {
      if (!snapshot) return;
      if (snapshot.documents) setTalentDocuments(snapshot.documents);
      setTalentUser(snapshot.talentUser ?? null);
      setTalentExperiences(snapshot.talentExperiences ?? []);
      setTalentEducations(snapshot.talentEducations ?? []);
      setTalentExtras(snapshot.talentExtras ?? []);
    },
    []
  );

  const uploadResumeFile = useCallback(
    async (file: File, resumeRequestToken?: string | null) => {
      const payload = await uploadTalentDocument({
        fetchWithAuth,
        file,
        resumeRequestToken,
      });

      return {
        requestCompleted: payload?.requestCompleted === true,
        resumeFileName: String(payload?.resumeFileName ?? file.name),
        resumeStoragePath: String(payload?.resumeStoragePath ?? ""),
        resumeDownloadUrl:
          typeof payload?.resumeDownloadUrl === "string"
            ? payload.resumeDownloadUrl
            : null,
        resumeText:
          typeof payload?.resumeText === "string" ? payload.resumeText : "",
        document:
          payload?.document && typeof payload.document === "object"
            ? (payload.document as CareerTalentDocument)
            : null,
      };
    },
    [fetchWithAuth]
  );

  const handleUploadTalentDocument = useCallback(
    async (file: File) => {
      if (!user || profileSavePending) return null;

      setProfileSavePending(true);
      setProfileSaveError("");
      try {
        const payload = await uploadTalentDocument({
          fetchWithAuth,
          file,
          kind: "document",
        });

        const document = payload?.document as
          | CareerTalentDocument
          | null
          | undefined;
        if (!document?.id) {
          throw new Error(tCareer(H.documentUploadResultMissing));
        }
        setTalentDocuments((previous) => [
          document,
          ...previous.filter((item) => item.id !== document.id),
        ]);
        showProfileSaveToast(tCareer(H.documentSaved));
        return document;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : tCareer(H.documentUploadFailed);
        showProfileSaveToast(message);
        return null;
      } finally {
        setProfileSavePending(false);
      }
    },
    [fetchWithAuth, profileSavePending, tCareer, user]
  );

  const applySessionProfile = useCallback(
    (payload: SessionResponse) => {
      const links = payload.conversation.resumeLinks ?? [];
      const normalizedLinks = toProfileLinks(links);
      setProfileLinks(normalizedLinks);
      setSavedProfileLinks(normalizedLinks);
      setSavedResumeFileName(payload.conversation.resumeFileName ?? null);
      setSavedResumeStoragePath(payload.conversation.resumeStoragePath ?? null);
      setSavedResumeDownloadUrl(payload.conversation.resumeDownloadUrl ?? null);
      setTalentDocuments(payload.conversation.documents ?? []);
      applyTalentProfileSnapshot(payload.talentProfile);
    },
    [applyTalentProfileSnapshot]
  );

  const handleProfileSubmit = useCallback(
    async (onSuccess?: () => void | Promise<void>) => {
      if (!user || !conversationId || profilePending) return false;

      const cleanedLinks = compactProfileLinks(profileLinks);
      const hasSavedResume = Boolean(
        savedResumeFileName || savedResumeStoragePath
      );
      if (hasInvalidLinkedinProfileInput(profileLinks)) {
        const message = tCareer(H.invalidLinkedinProfileUrl);
        setProfileError(message);
        showProfileSaveToast(message);
        return false;
      }
      if (!resumeFile && !hasSavedResume && cleanedLinks.length === 0) {
        setProfileError(tCareer(H.profileUploadRequired));
        return false;
      }

      setProfilePending(true);
      setProfileError("");
      setProfileSaveError("");
      setProfileSaveInfo("");
      setChatError("");

      try {
        let nextResumeFileName = savedResumeFileName ?? undefined;
        let nextResumeStoragePath = savedResumeStoragePath ?? undefined;
        let resumeText: string | undefined;
        let resumeDocumentId: string | undefined;
        let uploadedDocument: CareerTalentDocument | null = null;
        if (resumeFile) {
          const uploadResult = await uploadResumeFile(resumeFile);
          nextResumeFileName = uploadResult.resumeFileName;
          nextResumeStoragePath = uploadResult.resumeStoragePath;
          resumeDocumentId = uploadResult.document?.id;
          uploadedDocument = uploadResult.document;
          if (uploadResult.resumeText) resumeText = uploadResult.resumeText;
        }

        const response = await fetchWithAuth("/api/talent/onboarding/start", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            applyProfileSources: false,
            resumeDocumentId,
            resumeFileName: nextResumeFileName,
            resumeStoragePath: nextResumeStoragePath,
            resumeText,
            links: cleanedLinks,
            locale,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.onboardingStartFailed))
          );
        }

        if (
          payload?.profileIngestion &&
          payload.profileIngestion.ok === false
        ) {
          const ingestionError = getTranslatedProfileIngestionFailureMessage(
            payload.profileIngestion as ProfileIngestionPayload
          );
          showProfileSaveToast(
            tCareer(H.resumeLinksIngestionCreateFailed, {
              reason: ingestionError,
            })
          );
          console.warn(
            "[CareerProfile] profile ingestion failed:",
            payload.profileIngestion
          );
        } else {
          const warningMessage = getProfileIngestionWarningMessage(
            payload?.profileIngestion as ProfileIngestionPayload | undefined
          );
          if (warningMessage) {
            showProfileSaveToast(warningMessage);
          }
        }

        setStage((payload?.conversation?.stage as CareerStage) ?? "chat");
        appendMessage(toUiMessage(payload.userMessage));
        setSavedResumeFileName(payload?.conversation?.resumeFileName ?? null);
        setSavedResumeStoragePath(
          payload?.conversation?.resumeStoragePath ?? null
        );
        setSavedResumeDownloadUrl(
          payload?.conversation?.resumeDownloadUrl ?? null
        );
        setTalentDocuments(
          (payload?.conversation?.documents as
            | CareerTalentDocument[]
            | undefined) ??
            (uploadedDocument
              ? [
                  uploadedDocument,
                  ...talentDocuments.filter(
                    (document) => document.id !== uploadedDocument?.id
                  ),
                ]
              : talentDocuments)
        );
        const nextLinks = toProfileLinks(
          (payload?.conversation?.resumeLinks as string[] | undefined) ??
            cleanedLinks
        );
        setProfileLinks(nextLinks);
        setSavedProfileLinks(nextLinks);
        setResumeFile(null);
        applyTalentProfileSnapshot(
          payload?.talentProfile as SessionResponse["talentProfile"]
        );

        const assistants = (payload.assistantMessages ??
          []) as SessionResponse["messages"];
        for (const assistant of assistants) {
          await enqueueAssistantTypewriter(toUiMessage(assistant));
        }

        await onMessagesChanged?.([
          payload.userMessage as CareerMessagePayload,
          ...assistants,
        ]);

        await onSuccess?.();
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : tCareer(H.basicProfileSubmitFailed);
        setProfileError(message);
        return false;
      } finally {
        setProfilePending(false);
      }
    },
    [
      applyTalentProfileSnapshot,
      appendMessage,
      conversationId,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      getTranslatedProfileIngestionFailureMessage,
      locale,
      profileLinks,
      profilePending,
      resumeFile,
      savedResumeFileName,
      savedResumeStoragePath,
      setChatError,
      setStage,
      tCareer,
      talentDocuments,
      uploadResumeFile,
      user,
      onMessagesChanged,
    ]
  );

  const handleProfileLinkChange = useCallback(
    (index: number, value: string) => {
      setProfileLinks((prev) =>
        prev.map((item, itemIndex) => (itemIndex === index ? value : item))
      );
    },
    []
  );

  const handleRemoveProfileLink = useCallback((index: number) => {
    setProfileLinks((prev) =>
      prev.filter((_, itemIndex) => itemIndex !== index)
    );
  }, []);

  const handleAddProfileLink = useCallback(() => {
    setProfileLinks((prev) => [...prev, ""]);
  }, []);

  const handleSaveTalentProfile = useCallback(
    async (args?: {
      applyProfileSources?: boolean;
      links?: string[];
      persistError?: boolean;
      preserveLinkDrafts?: boolean;
      resumeFile?: File | null;
      resumeRequestToken?: string | null;
      structuredProfile?: CareerTalentProfile | null;
    }) => {
      if (!user || profileSavePending) return false;

      const structuredProfile = args?.structuredProfile ?? null;
      const sourceLinks = args?.links ?? profileLinks;
      const selectedResumeFile =
        args?.resumeFile !== undefined ? args.resumeFile : resumeFile;

      if (hasInvalidLinkedinProfileInput(sourceLinks)) {
        const message = tCareer(H.invalidLinkedinProfileUrl);
        if (args?.persistError !== false) setProfileSaveError(message);
        showProfileSaveToast(message);
        return false;
      }

      const cleanedLinks = compactProfileLinks(sourceLinks);
      const savedCleanedLinks = compactProfileLinks(savedProfileLinks);
      const hasUnsavedLinkChanges =
        cleanedLinks.length !== savedCleanedLinks.length ||
        cleanedLinks.some(
          (link, index) => link !== (savedCleanedLinks[index] ?? "").trim()
        );

      setProfileSavePending(true);
      setProfileSaveError("");
      setProfileSaveInfo("");

      try {
        let nextResumeFileName = savedResumeFileName;
        let nextResumeStoragePath = savedResumeStoragePath;
        let nextResumeDownloadUrl = savedResumeDownloadUrl;
        let nextResumeText: string | undefined;
        let resumeDocumentId: string | undefined;
        if (selectedResumeFile) {
          const uploadResult = await uploadResumeFile(
            selectedResumeFile,
            args?.resumeRequestToken
          );
          nextResumeFileName = uploadResult.resumeFileName;
          nextResumeStoragePath = uploadResult.resumeStoragePath;
          nextResumeDownloadUrl = uploadResult.resumeDownloadUrl;
          resumeDocumentId = uploadResult.document?.id;
          if (uploadResult.resumeText) {
            nextResumeText = uploadResult.resumeText;
          }

          if (uploadResult.requestCompleted) {
            setSavedResumeFileName(nextResumeFileName ?? null);
            setSavedResumeStoragePath(nextResumeStoragePath ?? null);
            setSavedResumeDownloadUrl(nextResumeDownloadUrl ?? null);
            if (uploadResult.document) {
              setTalentDocuments((previous) => [
                uploadResult.document!,
                ...previous.filter(
                  (document) => document.id !== uploadResult.document!.id
                ),
              ]);
            }
            setResumeFile(null);
            showProfileSaveToast(tCareer(H.profileSaved));
            return true;
          }
        }

        const response = await fetchWithAuth("/api/talent/profile/update", {
          method: "POST",
          body: JSON.stringify({
            applyProfileSources: args?.applyProfileSources !== false,
            resumeDocumentId,
            resumeFileName: nextResumeFileName,
            resumeStoragePath: nextResumeStoragePath,
            resumeText: nextResumeText,
            links: cleanedLinks,
            locale,
            structuredProfile,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.profileSaveFailed))
          );
        }

        const returnedLinks =
          (payload?.profile?.resumeLinks as string[] | undefined) ??
          cleanedLinks;
        const normalizedLinks = toProfileLinks(returnedLinks);
        setSavedResumeFileName(
          payload?.profile?.resumeFileName ?? nextResumeFileName ?? null
        );
        setSavedResumeStoragePath(
          payload?.profile?.resumeStoragePath ?? nextResumeStoragePath ?? null
        );
        setSavedResumeDownloadUrl(
          payload?.profile?.resumeDownloadUrl ?? nextResumeDownloadUrl ?? null
        );
        setSavedProfileLinks(normalizedLinks);
        if (!args?.preserveLinkDrafts) setProfileLinks(normalizedLinks);
        setResumeFile(null);
        if (Array.isArray(payload?.documents)) {
          setTalentDocuments(payload.documents as CareerTalentDocument[]);
        }

        if (payload?.talentProfile) {
          applyTalentProfileSnapshot(
            payload.talentProfile as SessionResponse["talentProfile"]
          );
        } else if (structuredProfile) {
          setTalentUser(structuredProfile.talentUser);
          setTalentExperiences(structuredProfile.talentExperiences);
          setTalentEducations(structuredProfile.talentEducations);
          setTalentExtras(structuredProfile.talentExtras);
        }

        const savedStructuredProfile = Boolean(structuredProfile);
        const savedResumeOrLinks =
          Boolean(selectedResumeFile) || hasUnsavedLinkChanges;
        const ingestion = payload?.profileIngestion as
          | ProfileIngestionPayload
          | null
          | undefined;
        if (ingestion?.ok === false) {
          showProfileSaveToast(
            tCareer(H.resumeLinksIngestionUpdateFailed, {
              reason: getTranslatedProfileIngestionFailureMessage(ingestion),
            })
          );
        } else if (getProfileIngestionWarningMessage(ingestion)) {
          showProfileSaveToast(
            getProfileIngestionWarningMessage(ingestion) ??
              tCareer(H.partialProfileUpdate)
          );
        } else if (ingestion?.ok === true) {
          showProfileSaveToast(tCareer(H.resumeLinksProfileUpdated));
        } else {
          showProfileSaveToast(
            savedStructuredProfile && savedResumeOrLinks
              ? tCareer(H.profileAndResumeLinksSaved)
              : savedStructuredProfile
                ? tCareer(H.profileSaved)
                : tCareer(H.resumeLinksSaved)
          );
        }

        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : tCareer(H.profileSaveFailed);
        if (args?.persistError !== false) setProfileSaveError(message);
        showProfileSaveToast(message);
        return false;
      } finally {
        setProfileSavePending(false);
      }
    },
    [
      applyTalentProfileSnapshot,
      fetchWithAuth,
      getTranslatedProfileIngestionFailureMessage,
      profileLinks,
      profileSavePending,
      resumeFile,
      savedProfileLinks,
      savedResumeDownloadUrl,
      savedResumeFileName,
      savedResumeStoragePath,
      tCareer,
      locale,
      uploadResumeFile,
      user,
    ]
  );

  const handleRefreshTalentProfileSources = useCallback(
    async (args?: { links?: string[] }) => {
      if (!user || profileSavePending) return false;

      const sourceLinks =
        args?.links ??
        (savedProfileLinks.length > 0 ? savedProfileLinks : profileLinks);
      if (hasInvalidLinkedinProfileInput(sourceLinks)) {
        const message = tCareer(H.invalidLinkedinProfileUrl);
        showProfileSaveToast(message);
        return false;
      }

      const cleanedLinks = compactProfileLinks(sourceLinks);
      const hasSavedResume = Boolean(
        savedResumeFileName || savedResumeStoragePath || savedResumeDownloadUrl
      );
      const hasLinkedinLink = cleanedLinks.some(isLinkedinProfileLink);

      if (!hasSavedResume && !hasLinkedinLink) {
        const message = tCareer(H.profileSourcesMissing);
        showProfileSaveToast(message);
        return false;
      }

      setProfileSavePending(true);
      setProfileSaveError("");
      setProfileSaveInfo("");

      try {
        const response = await fetchWithAuth("/api/talent/profile/update", {
          method: "POST",
          body: JSON.stringify({
            links: cleanedLinks,
            forceProfileIngestion: true,
            locale,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.profileRefreshFailed))
          );
        }

        const returnedLinks =
          (payload?.profile?.resumeLinks as string[] | undefined) ??
          cleanedLinks;
        const normalizedLinks = toProfileLinks(returnedLinks);
        setSavedResumeFileName(payload?.profile?.resumeFileName ?? null);
        setSavedResumeStoragePath(payload?.profile?.resumeStoragePath ?? null);
        setSavedResumeDownloadUrl(payload?.profile?.resumeDownloadUrl ?? null);
        setSavedProfileLinks(normalizedLinks);
        setProfileLinks(normalizedLinks);
        setResumeFile(null);
        if (Array.isArray(payload?.documents)) {
          setTalentDocuments(payload.documents as CareerTalentDocument[]);
        }

        if (payload?.talentProfile) {
          applyTalentProfileSnapshot(
            payload.talentProfile as SessionResponse["talentProfile"]
          );
        }

        const ingestion = payload?.profileIngestion as
          | ProfileIngestionPayload
          | null
          | undefined;
        if (ingestion?.ok === false) {
          const message = tCareer(H.profileRefreshFailedWithReason, {
            reason: getTranslatedProfileIngestionFailureMessage(ingestion),
          });
          showProfileSaveToast(message);
          return false;
        }

        const warningMessage = getProfileIngestionWarningMessage(ingestion);
        if (warningMessage) {
          showProfileSaveToast(warningMessage);
        } else {
          showProfileSaveToast(tCareer(H.profileSourcesRefreshed));
        }

        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : tCareer(H.profileRefreshFailed);
        showProfileSaveToast(message);
        return false;
      } finally {
        setProfileSavePending(false);
      }
    },
    [
      applyTalentProfileSnapshot,
      fetchWithAuth,
      getTranslatedProfileIngestionFailureMessage,
      profileLinks,
      profileSavePending,
      savedProfileLinks,
      savedResumeDownloadUrl,
      savedResumeFileName,
      savedResumeStoragePath,
      tCareer,
      locale,
      user,
    ]
  );

  const resetProfileState = useCallback(() => {
    setProfileLinks(toProfileLinks());
    setProfilePending(false);
    setProfileError("");
    setSavedProfileLinks(toProfileLinks());
    setSavedResumeFileName(null);
    setSavedResumeStoragePath(null);
    setSavedResumeDownloadUrl(null);
    setProfileSavePending(false);
    setProfileSaveError("");
    setProfileSaveInfo("");
    setTalentUser(null);
    setTalentExperiences([]);
    setTalentEducations([]);
    setTalentExtras([]);
    setTalentDocuments([]);
  }, []);

  const handleDeleteTalentDocument = useCallback(
    async (documentId: string) => {
      if (!user || profileSavePending) return false;

      setProfileSavePending(true);
      setProfileSaveError("");
      try {
        const response = await fetchWithAuth("/api/talent/documents", {
          method: "DELETE",
          body: JSON.stringify({ documentId }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.documentDeleteFailed))
          );
        }

        const documents = Array.isArray(payload?.documents)
          ? (payload.documents as CareerTalentDocument[])
          : [];
        setTalentDocuments(documents);
        const latestResume =
          documents.find(
            (document) => document.kind === "resume" && document.isPrimary
          ) ?? documents.find((document) => document.kind === "resume");
        setSavedResumeFileName(latestResume?.fileName ?? null);
        setSavedResumeStoragePath(latestResume?.storagePath ?? null);
        setSavedResumeDownloadUrl(latestResume?.downloadUrl ?? null);
        showProfileSaveToast(tCareer(H.documentDeleted));
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : tCareer(H.documentDeleteFailed);
        showProfileSaveToast(message);
        return false;
      } finally {
        setProfileSavePending(false);
      }
    },
    [fetchWithAuth, profileSavePending, tCareer, user]
  );

  const handleUpdateTalentDocument = useCallback(
    async (
      documentId: string,
      updates: {
        fileName?: string;
        isPrimary?: boolean;
        isPublic?: boolean;
      }
    ) => {
      if (!user || profileSavePending) return false;

      setProfileSavePending(true);
      setProfileSaveError("");
      try {
        const response = await fetchWithAuth("/api/talent/documents", {
          method: "PATCH",
          body: JSON.stringify({ documentId, ...updates }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.documentUpdateFailed))
          );
        }

        const documents = Array.isArray(payload?.documents)
          ? (payload.documents as CareerTalentDocument[])
          : [];
        setTalentDocuments(documents);
        const primaryResume =
          documents.find(
            (document) => document.kind === "resume" && document.isPrimary
          ) ?? documents.find((document) => document.kind === "resume");
        setSavedResumeFileName(primaryResume?.fileName ?? null);
        setSavedResumeStoragePath(primaryResume?.storagePath ?? null);
        setSavedResumeDownloadUrl(primaryResume?.downloadUrl ?? null);
        showProfileSaveToast(tCareer(H.documentUpdated));
        return true;
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : tCareer(H.documentUpdateFailed);
        showProfileSaveToast(message);
        return false;
      } finally {
        setProfileSavePending(false);
      }
    },
    [fetchWithAuth, profileSavePending, tCareer, user]
  );

  const handleCallNoteSaved = useCallback((document: CareerTalentDocument) => {
    if (document.kind !== "call_note") return;
    setTalentDocuments((previous) => [
      document,
      ...previous.filter((item) => item.id !== document.id),
    ]);
  }, []);

  const handleReadTalentCallNote = useCallback(
    async (documentId: string): Promise<CareerCallNote> => {
      const response = await fetchWithAuth(
        `/api/talent/call-notes/${encodeURIComponent(documentId)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.document?.callNote) {
        throw new Error(
          getErrorMessage(payload, "Failed to load the call note")
        );
      }
      return payload.document.callNote as CareerCallNote;
    },
    [fetchWithAuth]
  );

  return {
    resumeFile,
    setResumeFile,
    profileLinks,
    savedProfileLinks,
    profilePending,
    profileError,
    savedResumeFileName,
    savedResumeStoragePath,
    savedResumeDownloadUrl,
    profileSavePending,
    profileSaveError,
    profileSaveInfo,
    talentUser,
    talentExperiences,
    talentEducations,
    talentExtras,
    talentDocuments,
    applySessionProfile,
    handleProfileSubmit,
    handleProfileLinkChange,
    handleRemoveProfileLink,
    handleAddProfileLink,
    applyTalentProfileSnapshot,
    handleSaveTalentProfile,
    handleRefreshTalentProfileSources,
    handleUploadTalentDocument,
    handleUpdateTalentDocument,
    handleDeleteTalentDocument,
    handleCallNoteSaved,
    handleReadTalentCallNote,
    resetProfileState,
  };
};
