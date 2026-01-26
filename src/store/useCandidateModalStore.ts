import { create } from "zustand";

type ProfilePayload = {
  candidId: string;
  name: string;
};

type ModalState = {
  isOpen: boolean;
  payload: ProfilePayload | null;
  open: (payload: ProfilePayload) => void;
  close: () => void;
  // 새로 추가될 액션
  handleOpenProfile: (params: {
    candidId: string;
    name: string;
  }) => Promise<void>;
};

export const useCandidateModalStore = create<ModalState>((set, get) => ({
  isOpen: false,
  payload: null,

  open: (payload) => set({ isOpen: true, payload }),

  close: () => {
    const { isOpen } = get();
    if (!isOpen) return;
    set({ isOpen: false, payload: null });
  },

  handleOpenProfile: async ({ candidId, name }) => {
    const id = String(candidId);
    console.log("id 출력 >>> ", id);
    if (!id) return;

    try {
      // const data = await queryClient.fetchQuery({
      //   queryKey: candidateKey(id),
      //   queryFn: () => fetchCandidateDetail(id),
      //   staleTime: 60_000,
      // });

      get().open({ candidId: candidId, name: name });
    } catch (error) {
      console.error("Failed to fetch candidate data:", error);
    }
  },
}));
