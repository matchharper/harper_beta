import {
  getOfficialJobsCopy,
  type OfficialJobsLocale,
} from "@/lib/officialJobs/copy";
import { cn } from "@/lib/utils";

type OfficialJobsTreatmentMessageProps = {
  className?: string;
  locale: OfficialJobsLocale;
};

export default function OfficialJobsTreatmentMessage({
  className,
  locale,
}: OfficialJobsTreatmentMessageProps) {
  const copy = getOfficialJobsCopy(locale);

  return (
    <p className={cn("text-neutral-muted", className)}>
      {copy.cta.treatmentMessage}
    </p>
  );
}
