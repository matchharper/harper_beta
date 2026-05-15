import { useToastStore, type ToastInput } from "@/store/useToastStore";

export type ToastOptions = ToastInput;

export function showToast(opts: ToastOptions | string) {
  useToastStore.getState().add(opts);
}
