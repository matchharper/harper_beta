import { ExternalLink, Linkedin, MessageSquareText } from "lucide-react";
import React, { useEffect, useRef } from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { careerUpdateNotes } from "@/content/careerUpdateNotes";
import { PillLink } from "@/components/ui/pill";
import { Text } from "@/components/ui/typography";
import { CareerActionButton } from "./ui/CareerActionButton";
import Image from "next/image";

const harperActivityLinks = [
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/matchharper/",
    icon: (
      <Image
        src="/images/logos/linkedin.svg"
        alt="LinkedIn"
        width={16}
        height={16}
      />
    ),
  },
  // {
  //   label: "Website",
  //   href: "https://matchharper.com",
  //   icon: ExternalLink,
  // },
] as const;

const CareerUpdateNotesModal = ({
  open,
  onClose,
  onSuggestUpdate,
}: {
  open: boolean;
  onClose: () => void;
  onSuggestUpdate: () => void;
}) => {
  const latestId = careerUpdateNotes[0]?.id;
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(() => {
      contentRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel="업데이트 노트"
      overlayClassName="items-start pt-14"
      panelClassName="max-w-none w-[min(720px,calc(100vw-32px))] rounded-[18px] border-beige900/10 bg-[#fbfaf7]"
      bodyClassName="p-0"
      closeButtonClassName="right-4 top-4 rounded-[8px] text-beige900/45 hover:bg-beige900/6 hover:text-beige900"
    >
      <section className="font-geist text-beige900">
        <header className="border-b border-beige900/10 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <Text as="div" type="eyebrow">
              Update notes
            </Text>
            <Text as="h2" type="head2" className="mt-2">
              Harper 업데이트 노트
            </Text>
            <div className="mt-4 flex flex-row gap-2 items-center justify-between">
              <CareerActionButton
                type="button"
                actionVariant="secondary"
                onClick={onSuggestUpdate}
                className="h-8 shrink-0 px-3 text-xs font-normal"
              >
                <MessageSquareText className="h-3.5 w-3.5" />
                제안하기
              </CareerActionButton>
              <div className="mt-2 flex flex-wrap gap-2">
                {harperActivityLinks.map((link) => {
                  const LinkIcon = link.icon;

                  return (
                    <PillLink key={link.href} href={link.href}>
                      {LinkIcon}
                      {link.label}
                    </PillLink>
                  );
                })}
              </div>
            </div>
          </div>
        </header>

        <div
          ref={contentRef}
          tabIndex={-1}
          aria-label="업데이트 노트 내용"
          className="max-h-[min(68svh,640px)] overflow-y-auto px-5 py-2 outline-none"
        >
          <div className="divide-y divide-beige900/10">
            {careerUpdateNotes.map((note) => {
              const isLatest = note.id === latestId;

              return (
                <article
                  key={note.id}
                  className="flex flex-col md:grid md:grid-cols-[78px_minmax(0,1fr)] gap-4 py-5"
                >
                  <div className="pt-0.5">
                    <Text type="caption">{note.dateLabel}</Text>
                    {isLatest || note.tag ? (
                      <Text as="div" type="subtle" className="mt-1">
                        {note.tag ?? "Latest"}
                      </Text>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <Text as="h3" type="desc" className="font-medium">
                      {note.title}
                    </Text>
                    <Text type="desc" className="mt-2">
                      {note.summary}
                    </Text>

                    <ul className="mt-3 space-y-1.5">
                      {note.items.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                          <span
                            aria-hidden="true"
                            className="mt-2 h-1 w-1 shrink-0 rounded-full bg-beige900/35"
                          />
                          <Text as="span" type="desc">
                            {item}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </TalentCareerModal>
  );
};

export default React.memo(CareerUpdateNotesModal);
