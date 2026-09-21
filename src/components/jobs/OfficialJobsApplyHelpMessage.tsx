import {
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import { cn } from "@/lib/utils";

type OfficialJobsApplyHelpMessageProps = {
  className?: string;
  locale: OfficialJobsLocale;
};

export default function OfficialJobsApplyHelpMessage({
  className,
  locale,
}: OfficialJobsApplyHelpMessageProps) {
  const copy = getOfficialJobsCopy(locale);

  return (
    <p className={cn("text-neutral-muted", className)}>
      {copy.cta.applyHelpMessage}
    </p>
  );
}
