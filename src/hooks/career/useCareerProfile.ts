import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerMessage,
  CareerMessagePayload,
  CareerStage,
  CareerTalentEducation,
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
  isDocxResumeFile,
  isLinkedinLink,
  isLinkedinProfileLink,
  normalizeText,
  readDocxResumeText,
  toProfileLinks,
  toUiMessage,
} from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";
import { useCareerMessageFormatter } from "@/i18n/useCareerMessageFormatter";
import { useMessages } from "@/i18n/useMessage";
import { CAREER_HOOK_MESSAGES as H } from "./careerHookMessages";

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

const isServerParsedResumeFile = (file: File) => {
  const fileName = file.name.toLowerCase();
  return file.type === "application/pdf" || fileName.endsWith(".pdf");
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
      setTalentUser(snapshot.talentUser ?? null);
      setTalentExperiences(snapshot.talentExperiences ?? []);
      setTalentEducations(snapshot.talentEducations ?? []);
      setTalentExtras(snapshot.talentExtras ?? []);
    },
    []
  );

  const uploadResumeFile = useCallback(
    async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetchWithAuth("/api/talent/resume/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          getErrorMessage(payload, tCareer(H.resumeUploadFailed))
        );
      }

      return {
        resumeFileName: String(payload?.resumeFileName ?? file.name),
        resumeStoragePath: String(payload?.resumeStoragePath ?? ""),
        resumeDownloadUrl:
          typeof payload?.resumeDownloadUrl === "string"
            ? payload.resumeDownloadUrl
            : null,
      };
    },
    [fetchWithAuth, tCareer]
  );

  const readResumeText = useCallback(
    async (file: File) => {
      let text = "";
      if (isServerParsedResumeFile(file)) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithAuth("/api/talent/resume/parse", {
          method: "POST",
          body: formData,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, tCareer(H.resumeTextReadFailed))
          );
        }
        text = String(payload?.text ?? "");
      } else if (isDocxResumeFile(file)) {
        text = await readDocxResumeText(file);
      } else {
        text = await file.text();
      }

      const normalized = normalizeText(text);
      if (!normalized) {
        throw new Error(tCareer(H.resumeTextReadFailed));
      }
      return normalized.slice(0, 18000);
    },
    [fetchWithAuth, tCareer]
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
      applyTalentProfileSnapshot(payload.talentProfile);
    },
    [applyTalentProfileSnapshot]
  );

  const handleProfileSubmit = useCallback(
    async (onSuccess?: () => void | Promise<void>) => {
      if (!user || !conversationId || profilePending) return;

      const cleanedLinks = compactProfileLinks(profileLinks);
      const hasSavedResume = Boolean(
        savedResumeFileName || savedResumeStoragePath
      );
      if (hasInvalidLinkedinProfileInput(profileLinks)) {
        const message = tCareer(H.invalidLinkedinProfileUrl);
        setProfileError(message);
        showProfileSaveToast(message);
        return;
      }
      if (!resumeFile && !hasSavedResume && cleanedLinks.length === 0) {
        setProfileError(tCareer(H.profileUploadRequired));
        return;
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
        const hasLinkedinProfileLink = cleanedLinks.some(isLinkedinProfileLink);

        if (resumeFile) {
          let parsedText = "";
          try {
            parsedText = await readResumeText(resumeFile);
          } catch (error) {
            if (!hasLinkedinProfileLink) {
              throw error;
            }
            console.warn(
              "[CareerProfile] resume parse failed; continuing with LinkedIn only",
              error
            );
          }

          if (parsedText) {
            const uploadResult = await uploadResumeFile(resumeFile);
            nextResumeFileName = uploadResult.resumeFileName;
            nextResumeStoragePath = uploadResult.resumeStoragePath;
            resumeText = parsedText;
          }
        }

        const response = await fetchWithAuth("/api/talent/onboarding/start", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
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
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : tCareer(H.basicProfileSubmitFailed);
        setProfileError(message);
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
      readResumeText,
      resumeFile,
      savedResumeFileName,
      savedResumeStoragePath,
      setChatError,
      setStage,
      tCareer,
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
    async (args?: { structuredProfile?: CareerTalentProfile | null }) => {
      if (!user || profileSavePending) return false;

      const structuredProfile = args?.structuredProfile ?? null;

      if (hasInvalidLinkedinProfileInput(profileLinks)) {
        const message = tCareer(H.invalidLinkedinProfileUrl);
        setProfileSaveError(message);
        showProfileSaveToast(message);
        return false;
      }

      const cleanedLinks = compactProfileLinks(profileLinks);
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
        const hasLinkedinProfileLink = cleanedLinks.some(isLinkedinProfileLink);

        if (resumeFile) {
          let parsedText = "";
          try {
            parsedText = await readResumeText(resumeFile);
          } catch (error) {
            if (!hasLinkedinProfileLink) {
              throw error;
            }
            console.warn(
              "[CareerProfile] resume parse failed; continuing with LinkedIn only",
              error
            );
          }

          if (parsedText) {
            const uploadResult = await uploadResumeFile(resumeFile);
            nextResumeText = parsedText;
            nextResumeFileName = uploadResult.resumeFileName;
            nextResumeStoragePath = uploadResult.resumeStoragePath;
            nextResumeDownloadUrl = uploadResult.resumeDownloadUrl;
          }
        }

        const response = await fetchWithAuth("/api/talent/profile/update", {
          method: "POST",
          body: JSON.stringify({
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
        setProfileLinks(normalizedLinks);
        setResumeFile(null);

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
        const savedResumeOrLinks = Boolean(resumeFile) || hasUnsavedLinkChanges;
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
        setProfileSaveError(message);
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
      readResumeText,
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
        setProfileSaveError(message);
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
        setProfileSaveError(message);
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
          setProfileSaveError(message);
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
        setProfileSaveError(message);
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
  }, []);

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
    applySessionProfile,
    handleProfileSubmit,
    handleProfileLinkChange,
    handleRemoveProfileLink,
    handleAddProfileLink,
    applyTalentProfileSnapshot,
    handleSaveTalentProfile,
    handleRefreshTalentProfileSources,
    resetProfileState,
  };
};
