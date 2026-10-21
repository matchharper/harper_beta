import Head from "next/head";
import { LockKeyhole, MessageCircle } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import { OrgEntryAppBar } from "@/components/org/OrgEntryAppBar";
import { useAuthStore } from "@/store/useAuthStore";

export function OrgReviewPage() {
  const { c } = useOrgLocale();
  const isAuthenticated = useAuthStore((state) => Boolean(state.user));
  return (
    <div className="flex min-h-svh flex-col bg-bg-weak/30 text-neutral-primary">
      <Head>
        <title>{c("가입 검토 중", "Account under review")} · Harper</title>
      </Head>
      <OrgEntryAppBar isAuthenticated={isAuthenticated} />
      <main className="flex flex-1 items-center justify-center px-5 pb-16 pt-10">
        <section
          aria-labelledby="org-review-title"
          className="w-full max-w-[480px] rounded-xl border border-neutral-1000-a10 bg-bg-default px-6 py-7 text-center sm:px-8 sm:py-8"
        >
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-bg-weak">
            <LockKeyhole className="size-6" aria-hidden="true" />
          </div>
          <h1
            id="org-review-title"
            className="text-2xl font-medium leading-7 tracking-tight"
          >
            {c("가입 정보를 검토하고 있어요", "Your account is under review")}
          </h1>
          <p className="mt-4 break-keep text-[15px] leading-6 text-neutral-800">
            {c(
              "가입해 주셔서 감사합니다! 이제 팀이 자사 채용을 진행하시는게 맞는지만 검토 후 연락드리겠습니다. Harper는 외부에 Harper의 인재를 전달하지 않는 회사만 사용이 가능합니다.",
              "Thanks for signing up! We'll confirm that your team is hiring for your own company and get back to you. Harper is only available to companies that do not share Harper candidates with other organizations."
            )}
          </p>
          <div className="mt-8">
            <MuteButton
              type="button"
              variant="dark"
              size="md"
              className="w-full py-2"
              onClick={openCustomCrispWidget}
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              {c("Harper 팀에 문의", "Contact support")}
            </MuteButton>
          </div>
          <p className="mt-5 border-t border-neutral-1000-a05 pt-4 text-xs leading-5 text-neutral-muted">
            {c(
              "입력한 정보는 저장되어 있어요. 24시간 안에 검토 후 바로 연락드리겠습니다.",
              "Your information has been saved. Workspace access is paused until the review is complete."
            )}
          </p>
        </section>
      </main>
    </div>
  );
}
