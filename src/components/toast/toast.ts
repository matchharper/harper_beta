// components/toast/toast.ts
export type ToastOptions = {
  id?: string;
  message: string;
  variant?: "default" | "success" | "error" | "white";
  duration?: number; // ms
};

type ShowFn = (opts: ToastOptions | string) => void;
let _show: ShowFn | null = null;

export function setToast(fn: ShowFn) {
  _show = fn;
}

export function showToast(opts: ToastOptions | string) {
  if (!_show) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("ToastProvider is not mounted yet.");
    }
    return;
  }
  _show(opts);
}
