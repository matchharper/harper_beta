import { ExternalLink } from "lucide-react";
import { useGtmInvitePosting } from "@/hooks/career/useGtmInviteClaim";
import { useMessages } from "@/i18n/useMessage";

/**
 * On onboarding, for someone who came from a Harper GTM mail: the posting(s) they opened, and that they go into their
 * opportunities as soon as the profile is connected (the short onboarding: LinkedIn or a resume, then 내 기회).
 */
export default function GtmInvitePostingNote() {
  const posting = useGtmInvitePosting();
  const { locale } = useMessages();
  if (!posting) return null;
  const en = locale === "en";
  const more = (posting.count ?? 1) - 1;
  const label = [posting.companyName, posting.title].filter(Boolean).join(" · ")
    + (more > 0 ? (en ? ` and ${more} more` : ` 외 ${more}곳`) : "");
  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pt-4 md:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-neutral-1000-a10 bg-bg-floating px-4 py-3 text-[13px] leading-5">
        <span className="font-medium text-neutral-primary">{label}</span>
        <span className="text-neutral-muted">
          {en
            ? `${more > 0 ? "The roles" : "The role"} from your email will be in your opportunities as soon as your profile is connected.`
            : "메일로 받은 공고예요. 프로필을 연결하면 바로 내 기회에 담겨요."}
        </span>
        <a
          href={`/jobs/invite/${encodeURIComponent(posting.mailId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-neutral-primary underline decoration-neutral-1000-a10 underline-offset-4"
        >
          {en ? (more > 0 ? "View the roles" : "View the role") : "공고 다시 보기"}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
