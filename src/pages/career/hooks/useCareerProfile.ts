import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { User } from "@supabase/supabase-js";
import type {
  CareerMessage,
  CareerStage,
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
};

export const useCareerProfile = ({
  user,
  conversationId,
  fetchWithAuth,
  setStage,
  appendMessage,
  enqueueAssistantTypewriter,
  setChatError,
}: UseCareerProfileArgs) => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [profileLinks, setProfileLinks] = useState<string[]>(["", "", ""]);
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

  const applySessionProfile = useCallback((payload: SessionResponse) => {
    const links = payload.conversation.resumeLinks ?? [];
    setProfileLinks(toProfileLinks(links));
    setSavedResumeFileName(payload.conversation.resumeFileName ?? null);
    setSavedResumeStoragePath(payload.conversation.resumeStoragePath ?? null);
    setSavedResumeDownloadUrl(payload.conversation.resumeDownloadUrl ?? null);
  }, []);

  const handleProfileSubmit = useCallback(
    async (onSuccess?: () => void | Promise<void>) => {
      if (!user || !conversationId || profilePending) return;

      if (!resumeFile) {
        setProfileError("이력서를 업로드해 주세요.");
        return;
      }

      const cleanedLinks = profileLinks.map((link) => link.trim()).filter(Boolean);
      if (cleanedLinks.length === 0) {
        setProfileError("LinkedIn/GitHub 등 링크를 하나 이상 입력해 주세요.");
        return;
      }

      setProfilePending(true);
      setProfileError("");
      setProfileSaveError("");
      setProfileSaveInfo("");
      setChatError("");

      try {
        const uploadResult = await uploadResumeFile(resumeFile);
        const resumeText = await readResumeText(resumeFile);

        const response = await fetchWithAuth("/api/talent/onboarding/start", {
          method: "POST",
          body: JSON.stringify({
            conversationId,
            resumeFileName: uploadResult.resumeFileName,
            resumeStoragePath: uploadResult.resumeStoragePath,
            resumeText,
            links: cleanedLinks,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "온보딩 시작에 실패했습니다."));
        }

        setStage((payload?.conversation?.stage as CareerStage) ?? "chat");
        appendMessage(toUiMessage(payload.userMessage));
        setSavedResumeFileName(payload?.conversation?.resumeFileName ?? null);
        setSavedResumeStoragePath(payload?.conversation?.resumeStoragePath ?? null);
        setSavedResumeDownloadUrl(payload?.conversation?.resumeDownloadUrl ?? null);
        setProfileLinks(
          (payload?.conversation?.resumeLinks as string[] | undefined) ??
            cleanedLinks
        );
        setResumeFile(null);

        const assistants = (payload.assistantMessages ??
          []) as SessionResponse["messages"];
        for (const assistant of assistants) {
          await enqueueAssistantTypewriter(toUiMessage(assistant));
        }

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
      appendMessage,
      conversationId,
      enqueueAssistantTypewriter,
      fetchWithAuth,
      profileLinks,
      profilePending,
      readResumeText,
      resumeFile,
      setChatError,
      setStage,
      uploadResumeFile,
      user,
    ]
  );

  const handleProfileLinkChange = useCallback((index: number, value: string) => {
    setProfileLinks((prev) =>
      prev.map((item, itemIndex) => (itemIndex === index ? value : item))
    );
  }, []);

  const handleRemoveProfileLink = useCallback((index: number) => {
    setProfileLinks((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleAddProfileLink = useCallback(() => {
    setProfileLinks((prev) => [...prev, ""]);
  }, []);

  const handleSaveTalentProfile = useCallback(async () => {
    if (!user || profileSavePending) return;

    const cleanedLinks = profileLinks.map((link) => link.trim()).filter(Boolean);

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
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "프로필 저장에 실패했습니다."));
      }

      const returnedLinks =
        (payload?.profile?.resumeLinks as string[] | undefined) ?? cleanedLinks;
      setSavedResumeFileName(
        payload?.profile?.resumeFileName ?? nextResumeFileName ?? null
      );
      setSavedResumeStoragePath(
        payload?.profile?.resumeStoragePath ?? nextResumeStoragePath ?? null
      );
      setSavedResumeDownloadUrl(
        payload?.profile?.resumeDownloadUrl ?? nextResumeDownloadUrl ?? null
      );
      setProfileLinks(toProfileLinks(returnedLinks));
      setResumeFile(null);
      setProfileSaveInfo("이력서/링크 정보를 저장했습니다.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "프로필 저장에 실패했습니다.";
      setProfileSaveError(message);
    } finally {
      setProfileSavePending(false);
    }
  }, [
    fetchWithAuth,
    profileLinks,
    profileSavePending,
    readResumeText,
    resumeFile,
    savedResumeDownloadUrl,
    savedResumeFileName,
    savedResumeStoragePath,
    uploadResumeFile,
    user,
  ]);

  const resetProfileState = useCallback(() => {
    setProfilePending(false);
    setProfileError("");
    setSavedResumeFileName(null);
    setSavedResumeStoragePath(null);
    setSavedResumeDownloadUrl(null);
    setProfileSavePending(false);
    setProfileSaveError("");
    setProfileSaveInfo("");
  }, []);

  return {
    resumeFile,
    setResumeFile,
    profileLinks,
    profilePending,
    profileError,
    savedResumeFileName,
    savedResumeStoragePath,
    savedResumeDownloadUrl,
    profileSavePending,
    profileSaveError,
    profileSaveInfo,
    applySessionProfile,
    handleProfileSubmit,
    handleProfileLinkChange,
    handleRemoveProfileLink,
    handleAddProfileLink,
    handleSaveTalentProfile,
    resetProfileState,
  };
};
