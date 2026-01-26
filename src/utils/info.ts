import { showToast } from "@/components/toast/toast";

export const handleContactUs = async () => {
  await navigator.clipboard.writeText("chris@asksonus.com");
  showToast({
    message: "Email copied to clipboard",
  });
};
