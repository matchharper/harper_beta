export const CUSTOM_CRISP_OPEN_EVENT = "harper:open-custom-crisp";

export function openCustomCrispWidget() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CUSTOM_CRISP_OPEN_EVENT));
}
