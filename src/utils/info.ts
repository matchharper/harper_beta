import { showToast } from "@/components/toast/toast";

export const handleContactUs = async () => {
  await navigator.clipboard.writeText("chris@matchharper.com");
  showToast({
    message: "Email copied to clipboard",
  });
};
