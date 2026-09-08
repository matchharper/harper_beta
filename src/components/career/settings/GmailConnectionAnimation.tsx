import { Mail } from "lucide-react";
import Image from "next/image";
import Face from "@/components/common/Face";
import { cn } from "@/lib/utils";
import styles from "./GmailConnectionAnimation.module.css";

// Retain the alternatives for the local comparison page; delivery is the product default.
export const GMAIL_ANIMATION_VARIANTS = [
  "delivery",
  "gather",
  "organize",
] as const;
export type GmailAnimationVariant = (typeof GMAIL_ANIMATION_VARIANTS)[number];

function GmailTile({ className }: { className?: string }) {
  return (
    <div className={cn(styles.gmail, className)}>
      <Image
        src="/images/logos/gmail.svg"
        alt=""
        width={34}
        height={26}
        draggable={false}
      />
    </div>
  );
}

function Letter({ className }: { className?: string }) {
  return (
    <div className={cn(styles.letter, className)}>
      <Mail size={19} strokeWidth={1.4} />
    </div>
  );
}

export function GmailConnectionAnimation({
  variant = "delivery",
}: {
  variant?: GmailAnimationVariant;
}) {
  return (
    <div aria-hidden="true" className={styles.viewport}>
      <div className={styles.scene}>
        {variant === "delivery" ? (
          <>
            <div className={styles.deliveryTrack} />
            <GmailTile className={styles.deliveryGmail} />
            <Letter className={styles.deliveryLetter} />
            <Letter
              className={cn(styles.deliveryLetter, styles.deliveryLetterTwo)}
            />
            <div className={styles.deliveryFace}>
              <Face size={132} status="closing" expressionOffset={{ x: -2 }} />
            </div>
            <span className={styles.deliveryGlow} />
          </>
        ) : variant === "gather" ? (
          <>
            <div className={styles.gatherRing} />
            <div className={styles.gatherFace}>
              <Face size={144} status="listening" />
            </div>
            <GmailTile className={styles.gatherGmail} />
            <Letter
              className={cn(styles.gatherLetter, styles.gatherLetterOne)}
            />
            <Letter
              className={cn(styles.gatherLetter, styles.gatherLetterTwo)}
            />
            <Letter
              className={cn(styles.gatherLetter, styles.gatherLetterThree)}
            />
            <span className={cn(styles.gatherDot, styles.gatherDotOne)} />
            <span className={cn(styles.gatherDot, styles.gatherDotTwo)} />
          </>
        ) : (
          <>
            <GmailTile className={styles.organizeGmail} />
            <Letter className={styles.organizeLetter} />
            <div className={styles.paperStack}>
              <div className={styles.paperBack} />
              <div className={styles.paperMiddle} />
              <div className={styles.paper}>
                <span className={styles.paperHeading} />
                {[0, 1, 2].map((row) => (
                  <div key={row} className={styles.paperRow}>
                    <span className={styles.paperBullet} />
                    <span className={styles.paperLine} />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.organizeFace}>
              <Face
                size={126}
                status="closing"
                expressionOffset={{ x: -3, y: -2 }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
