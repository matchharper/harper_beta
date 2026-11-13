import { ExternalLink } from "lucide-react";
import { useGtmInvitePosting } from "@/hooks/career/useGtmInviteClaim";
import { useMessages } from "@/i18n/useMessage";

/**
 * On onboarding, for someone who came from a Harper GTM mail: the posting they opened, and that it goes
 * into their opportunities when onboarding is done (the claim runs then, so it is scored with their profile).
 */
export default function GtmInvitePostingNote() {
  const posting = useGtmInvitePosting();
  const { locale } = useMessages();
  if (!posting) return null;
  const label = [posting.companyName, posting.title].filter(Boolean).join(" · ");
  const en = locale === "en";
  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pt-4 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-neutral-1000-a10 bg-bg-floating px-4 py-3 text-[13px] leading-5">
        <span className="font-medium text-neutral-primary">{label}</span>
        <span className="text-neutral-muted">
          {en
            ? "The role from your email goes into your opportunities when you finish."
            : "메일로 받은 공고예요. 온보딩을 마치면 내 기회에 담아 드려요."}
        </span>
        <a
          href={`/jobs/invite/${encodeURIComponent(posting.mailId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-neutral-primary underline decoration-neutral-1000-a10 underline-offset-4"
        >
          {en ? "View the role" : "공고 다시 보기"}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
