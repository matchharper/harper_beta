import { QueryType } from "@/types/type";
import { create } from "zustand";

// Profile Store State
interface HistoryStoreState {
  queryItems: QueryType[];
  setQueryItems: (queryItems: QueryType[]) => void;
}

export const useHistoryStore = create<HistoryStoreState>((set) => ({
  queryItems: [],
  setQueryItems: (queryItems) => set({ queryItems }),
}));

export default useHistoryStore;
