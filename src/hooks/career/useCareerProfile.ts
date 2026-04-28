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
import {
  getErrorMessage,
  normalizeText,
  toProfileLinks,
  toUiMessage,
} from "./careerHelpers";
import type { FetchWithAuth } from "./useCareerApi";

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
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [profileLinks, setProfileLinks] = useState<string[]>(() =>
    toProfileLinks()
  );
  const [savedProfileLinks, setSavedProfileLinks] =
    useState<string[]>(() => toProfileLinks());
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
          getErrorMessage(payload, "이력서 파일 업로드에 실패했습니다.")
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
    [fetchWithAuth]
  );

  const readResumeText = useCallback(
    async (file: File) => {
      let text = "";
      if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      ) {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetchWithAuth("/api/talent/resume/parse", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error("PDF에서 텍스트를 읽지 못했습니다.");
        }
        const payload = await response.json();
        text = String(payload?.text ?? "");
      } else {
        text = await file.text();
      }

      const normalized = normalizeText(text);
      if (!normalized) {
        throw new Error(
          "이력서 텍스트를 읽지 못했습니다. 다른 파일로 시도해 주세요."
        );
      }
      return normalized.slice(0, 18000);
    },
    [fetchWithAuth]
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

      const cleanedLinks = profileLinks
        .filter((link) => link.trim().includes("linkedin.com"))
        .filter(Boolean);
      const hasSavedResume = Boolean(
        savedResumeFileName || savedResumeStoragePath
      );
      if (!resumeFile && !hasSavedResume && cleanedLinks.length === 0) {
        setProfileError("이력서 혹은 링크드인 링크를 업로드해 주세요.");
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

        if (resumeFile) {
          const uploadResult = await uploadResumeFile(resumeFile);
          nextResumeFileName = uploadResult.resumeFileName;
          nextResumeStoragePath = uploadResult.resumeStoragePath;
          resumeText = await readResumeText(resumeFile);
        }

        const response = await fetchWithAuth("/api/talent/onboarding/start", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            resumeFileName: nextResumeFileName,
            resumeStoragePath: nextResumeStoragePath,
            resumeText,
            links: cleanedLinks,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "온보딩 시작에 실패했습니다.")
          );
        }

        if (
          payload?.profileIngestion &&
          payload.profileIngestion.ok === false
        ) {
          const ingestionError =
            typeof payload?.profileIngestion?.error === "string"
              ? payload.profileIngestion.error
              : "원인을 확인하지 못했습니다.";
          setProfileSaveInfo(
            `참고: LinkedIn 자동 구조화 저장에 실패했습니다. (${ingestionError})`
          );
          console.warn(
            "[CareerProfile] profile ingestion failed:",
            payload.profileIngestion
          );
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
            : "기본 정보 제출 중 오류가 발생했습니다.";
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
      profileLinks,
      profilePending,
      readResumeText,
      resumeFile,
      savedResumeFileName,
      savedResumeStoragePath,
      setChatError,
      setStage,
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

      const cleanedLinks = profileLinks
        .map((link) => link.trim())
        .filter(Boolean);
      const hasUnsavedLinkChanges =
        cleanedLinks.length !== savedProfileLinks.length ||
        cleanedLinks.some(
          (link, index) => link !== (savedProfileLinks[index] ?? "").trim()
        );

      setProfileSavePending(true);
      setProfileSaveError("");
      setProfileSaveInfo("");

      try {
        let nextResumeFileName = savedResumeFileName;
        let nextResumeStoragePath = savedResumeStoragePath;
        let nextResumeDownloadUrl = savedResumeDownloadUrl;
        let nextResumeText: string | undefined;

        if (resumeFile) {
          const uploadResult = await uploadResumeFile(resumeFile);
          nextResumeText = await readResumeText(resumeFile);
          nextResumeFileName = uploadResult.resumeFileName;
          nextResumeStoragePath = uploadResult.resumeStoragePath;
          nextResumeDownloadUrl = uploadResult.resumeDownloadUrl;
        }

        const response = await fetchWithAuth("/api/talent/profile/update", {
          method: "POST",
          body: JSON.stringify({
            resumeFileName: nextResumeFileName,
            resumeStoragePath: nextResumeStoragePath,
            resumeText: nextResumeText,
            links: cleanedLinks,
            structuredProfile,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "프로필 저장에 실패했습니다.")
          );
        }

        const returnedLinks =
          (payload?.profile?.resumeLinks as string[] | undefined) ?? cleanedLinks;
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
        setProfileSaveInfo(
          savedStructuredProfile && savedResumeOrLinks
            ? "프로필과 이력서/링크 정보를 저장했습니다."
            : savedStructuredProfile
              ? "프로필을 저장했습니다."
              : "이력서/링크 정보를 저장했습니다."
        );

        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "프로필 저장에 실패했습니다.";
        setProfileSaveError(message);
        return false;
      } finally {
        setProfileSavePending(false);
      }
    },
    [
      applyTalentProfileSnapshot,
      fetchWithAuth,
      profileLinks,
      profileSavePending,
      readResumeText,
      resumeFile,
      savedProfileLinks,
      savedResumeDownloadUrl,
      savedResumeFileName,
      savedResumeStoragePath,
      uploadResumeFile,
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
    handleSaveTalentProfile,
    resetProfileState,
  };
};
