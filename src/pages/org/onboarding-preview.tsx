import dynamic from "next/dynamic";
import ErrorPage from "next/error";
import { canUseOrgDevControls } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";

const Preview = dynamic(
  () => import("@/components/org/onboarding/OrgOnboardingPreview"),
  { ssr: false }
);

export default function CompanyOnboardingPreview() {
  const loading = useAuthStore((state) => state.loading);
  const email = useAuthStore((state) => state.user?.email);
  // Local previews need no login. Production uses the same access as home controls.
  if (process.env.NODE_ENV === "production") {
    if (loading) return null;
    if (!canUseOrgDevControls(email)) return <ErrorPage statusCode={404} />;
  }
  return <Preview />;
}
