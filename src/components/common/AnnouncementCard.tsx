import { useId, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { MuteButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type AnnouncementCardAction = { label: string } & (
  | { href: string; onClick?: never }
  | { href?: never; onClick: () => void }
);

type AnnouncementCardProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  media?: ReactNode;
  action?: AnnouncementCardAction;
  closeLabel: string;
};

/** A persistent, non-modal notice. The caller owns its audience and seen state. */
export function AnnouncementCard({
  open,
  onClose,
  title,
  children,
  media,
  action,
  closeLabel,
}: AnnouncementCardProps) {
  const titleId = useId();
  const reducedMotion = useReducedMotion();

  if (!open) return null;

  return (
    <motion.aside
      aria-labelledby={titleId}
      aria-live="polite"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 w-[calc(100%-2rem)] max-w-[320px] sm:right-6 sm:bottom-6"
      initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}
    >
      <Card className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-lg shadow-none">
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-3">
          <h2
            id={titleId}
            className="min-w-0 self-center text-[15px] font-medium wrap-break-word"
          >
            {title}
          </h2>
          <MuteButton
            type="button"
            variant="transparent"
            aria-label={closeLabel}
            onClick={onClose}
            className="-mr-2 shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </MuteButton>
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {media && (
            <div className="px-4">
              <div className="overflow-hidden rounded-md bg-primary-faded">
                {media}
              </div>
            </div>
          )}
          <div className="min-h-[110px] flex flex-col justify-between px-5 pt-6 pb-6 text-[13px] wrap-break-word">
            {children}
            {action && (
              <div className="mt-6">
                {action.href !== undefined ? (
                  <MuteButton
                    asChild
                    variant="neutral"
                    className="w-full shadow-none"
                  >
                    <Link href={action.href}>{action.label}</Link>
                  </MuteButton>
                ) : (
                  <MuteButton
                    type="button"
                    variant="neutral"
                    className="w-full shadow-none"
                    onClick={action.onClick}
                  >
                    {action.label}
                  </MuteButton>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.aside>
  );
}
