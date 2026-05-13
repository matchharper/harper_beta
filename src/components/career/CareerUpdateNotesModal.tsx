import { CalendarDays, CheckCircle2, MessageSquareText } from "lucide-react";
import React from "react";
import TalentCareerModal from "@/components/common/TalentCareerModal";
import { careerUpdateNotes } from "@/content/careerUpdateNotes";
import { careerCx } from "./ui/CareerPrimitives";

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

  return (
    <TalentCareerModal
      open={open}
      onClose={onClose}
      ariaLabel="업데이트 노트"
      overlayClassName="items-start pt-14"
      backdropClassName="bg-beige900/20 backdrop-blur-[3px]"
      panelClassName="max-w-none w-[min(560px,calc(100vw-32px))] rounded-[16px] border-beige900/10 bg-beige50 shadow-[0_24px_70px_rgba(37,20,6,0.18)]"
      bodyClassName="p-0"
      closeButtonClassName="right-4 top-4 rounded-[8px] text-beige900/45 hover:bg-beige900/6 hover:text-beige900"
    >
      <section className="font-geist text-beige900">
        <header className="border-b border-beige900/10 px-5 pb-4 pt-5">
          <div className="pr-10">
            <div className="text-[11px] font-medium uppercase text-beige900/40">
              Update notes
            </div>
            <h2 className="mt-2 font-hedvig text-[20px] leading-none text-beige900">
              Harper 업데이트 노트
            </h2>
          </div>
          <button
            type="button"
            onClick={onSuggestUpdate}
            className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] border border-beige900/10 bg-white/60 px-3 text-xs font-medium text-beige900/65 transition-colors hover:border-beige900/20 hover:bg-white hover:text-beige900"
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            업데이트 제안하기
          </button>
        </header>

        <div className="max-h-[min(68vh,640px)] overflow-y-auto px-5 py-4">
          <div className="space-y-3">
            {careerUpdateNotes.map((note) => {
              const isLatest = note.id === latestId;

              return (
                <article
                  key={note.id}
                  className={careerCx(
                    "rounded-[8px] border p-4 transition-colors",
                    isLatest
                      ? "border-beige900/15 bg-white/80 shadow-[0_10px_28px_rgba(37,20,6,0.06)]"
                      : "border-beige900/10 bg-white/45"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={careerCx(
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                        isLatest
                          ? "bg-beige900 text-beige50"
                          : "bg-beige200 text-beige900/55"
                      )}
                    >
                      <CalendarDays className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-beige900/45">
                          {note.dateLabel}
                        </span>
                        {note.tag ? (
                          <span className="rounded-full bg-beige900 px-2 py-0.5 text-[10px] font-semibold uppercase leading-4 text-beige50">
                            {note.tag}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="mt-1 text-[15px] font-semibold leading-6 text-beige900">
                        {note.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-beige900/55">
                        {note.summary}
                      </p>

                      <ul className="mt-3 space-y-2">
                        {note.items.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-2 text-sm leading-6 text-beige900/65"
                          >
                            <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-beige900/40" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
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
