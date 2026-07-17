const CAREER_REFERRAL_MODAL_EVENT = "harper:career-referral-modal";

export function openCareerReferralModal() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CAREER_REFERRAL_MODAL_EVENT));
}

export function subscribeCareerReferralModalOpen(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const listener = () => callback();
  window.addEventListener(CAREER_REFERRAL_MODAL_EVENT, listener);
  return () => window.removeEventListener(CAREER_REFERRAL_MODAL_EVENT, listener);
}

