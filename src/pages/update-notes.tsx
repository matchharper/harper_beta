import type { GetStaticProps } from "next";
import { ExternalLink, MessageSquareText } from "lucide-react";
import DocumentPageShell from "@/components/landing/DocumentPageShell";
import { Badge } from "@/components/ui/badge";
import { MuteButton } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { openCustomCrispWidget } from "@/lib/feedback/customCrispEvents";
import {
  loadCareerUpdateNotes,
  type CareerUpdateNote,
} from "@/lib/careerUpdateNotes.server";
import { useMessages, type Locale } from "@/i18n/useMessage";
import Image from "next/image";

type CareerUpdateNotesPageProps = {
  notes: CareerUpdateNote[];
};

const PAGE_COPY: Record<
  Locale,
  {
    description: string;
    empty: string;
    latest: string;
    noUpdates: string;
    suggest: string;
    title: string;
  }
> = {
  ko: {
    description:
      "Harper가 Talent를 위해 새롭게 만들고 개선한 내용을 확인할 수 있어요.",
    empty: "아직 공개된 업데이트가 없어요.",
    latest: "최근 업데이트",
    noUpdates: "업데이트 준비 중",
    suggest: "제안하기",
    title: "Harper 업데이트 노트",
  },
  en: {
    description: "See what Harper has recently built and improved for Talent.",
    empty: "There are no published updates yet.",
    latest: "Latest update",
    noUpdates: "Updates coming soon",
    suggest: "Share feedback",
    title: "Harper Update Notes",
  },
};

export const getStaticProps: GetStaticProps<
  CareerUpdateNotesPageProps
> = async () => ({
  props: {
    notes: await loadCareerUpdateNotes(),
  },
});

export default function CareerUpdateNotesPage({
  notes,
}: CareerUpdateNotesPageProps) {
  const { locale } = useMessages();
  const copy = PAGE_COPY[locale];
  const latestDate = notes[0]?.date;

  return (
    <DocumentPageShell
      title={copy.title}
      description={copy.description}
      locale={locale}
      landingChrome
      aside={
        <div className="rounded-sm border-b border-neutral-1000/2 bg-bg-basement pb-4 lg:border p-3">
          <Text type="subtle" className="text-primary">
            {copy.latest}
          </Text>
          <Text type="caption" className="mt-1 text-neutral-soft">
            {latestDate ?? copy.noUpdates}
          </Text>
          <div className="mt-5 flex flex-wrap gap-2 lg:flex-col">
            <MuteButton
              type="button"
              onClick={openCustomCrispWidget}
              className="justify-start"
            >
              <MessageSquareText className="h-3.5 w-3.5" />
              {copy.suggest}
            </MuteButton>
            <MuteButton asChild className="justify-start">
              <a
                href="https://www.linkedin.com/company/matchharper/"
                target="_blank"
                rel="noreferrer"
              >
                <Image
                  src="/images/logos/linkedin.svg"
                  alt="LinkedIn"
                  width={18}
                  height={18}
                />
                LinkedIn
              </a>
            </MuteButton>
          </div>
        </div>
      }
    >
      {notes.length === 0 ? (
        <Text type="desc" className="text-neutral-muted">
          {copy.empty}
        </Text>
      ) : (
        <div className="divide-y divide-neutral-1000-a05 border-t border-neutral-1000-a05 pb-40">
          {notes.map((note) => (
            <section
              key={`${note.date}-${note.tag}-${note.en}`}
              className="grid gap-4 py-4 items-start sm:grid-cols-[200px_minmax(0,1fr)]"
            >
              <div className="mt-[1px] flex flex-row gap-6 items-center">
                <Text type="caption" className="text-neutral-muted">
                  {note.date}
                </Text>
                <Badge size="sm" variant="faded" className="sm:w-fit">
                  {note.tag}
                </Badge>
              </div>
              <Text type="desc" className="text-neutral-primary">
                {locale === "ko" ? note.ko : note.en}
              </Text>
            </section>
          ))}
        </div>
      )}
    </DocumentPageShell>
  );
}
