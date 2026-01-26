import { create } from "zustand";

// Profile Store State
interface ProfileStoreState {
  resumeIdState: string;
  resumeText: string;
  files: File | null;
  isFileChanged: boolean;
  fileName: string;
  fileSize: number;
  setResumeIdState: (resumeIdState: string) => void;
  setResumeText: (resumeText: string) => void;
  setFiles: (files: File | null) => void;
  setIsFileChanged: (isFileChanged: boolean) => void;
  setFileName: (fileName: string) => void;
  setFileSize: (fileSize: number) => void;
  resetProfile: () => void;
}

export const useProfileStore = create<ProfileStoreState>((set) => ({
  resumeIdState: "",
  resumeText: "",
  files: null,
  isFileChanged: false,
  fileName: "",
  fileSize: 0,
  setResumeIdState: (resumeIdState) => set({ resumeIdState }),
  setResumeText: (resumeText) => set({ resumeText }),
  setFiles: (files) => set({ files }),
  setIsFileChanged: (isFileChanged) => set({ isFileChanged }),
  setFileName: (fileName) => set({ fileName }),
  setFileSize: (fileSize) => set({ fileSize }),
  resetProfile: () =>
    set({
      resumeIdState: "",
      resumeText: "",
      files: null,
      isFileChanged: false,
      fileName: "",
      fileSize: 0,
    }),
}));

export default useProfileStore;
