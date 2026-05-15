import { create } from "zustand";

export type ToastVariant = "default" | "success" | "error" | "white";

export type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  ttl: number;
};

export type ToastInput = {
  id?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastStore = {
  list: ToastItem[];
  add: (input: ToastInput | string) => void;
  remove: (id: string) => void;
};

export const useToastStore = create<ToastStore>()((set) => ({
  list: [],
  add: (input) => {
    const opts: ToastInput =
      typeof input === "string" ? { message: input } : input;

    const id = opts.id ?? Math.random().toString(36).slice(2);
    const duration = opts.duration ?? 3000;

    set((state) => ({
      list: [
        ...state.list,
        {
          id,
          message: opts.message,
          variant: opts.variant ?? "default",
          ttl: duration,
        },
      ],
    }));

    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        set((state) => ({
          list: state.list.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },
  remove: (id) =>
    set((state) => ({ list: state.list.filter((t) => t.id !== id) })),
}));
