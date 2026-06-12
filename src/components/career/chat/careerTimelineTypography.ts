import type React from "react";

/**
 * Timeline chat typography controls.
 *
 * The main knob for CareerMessageBubble is `message.mobile.fontSize`.
 * `desktop` starts at Tailwind's `md:` breakpoint.
 * RichText paragraphs, lists, blockquotes, and user bubbles inherit these.
 */
export const CAREER_TIMELINE_TYPOGRAPHY = {
  message: {
    mobile: {
      fontSize: "15px",
      lineHeight: "1.72",
    },
    desktop: {
      fontSize: "14px",
      lineHeight: "1.8",
    },
  },
  body: {
    mobile: {
      fontSize: "13px",
      lineHeight: "1.65",
    },
    desktop: {
      fontSize: "13px",
      lineHeight: "1.65",
    },
  },
  meta: {
    mobile: {
      fontSize: "12px",
      lineHeight: "1.55",
    },
    desktop: {
      fontSize: "12px",
      lineHeight: "1.55",
    },
  },
  feedbackNote: {
    mobile: {
      fontSize: "13px",
      lineHeight: "1.5",
    },
    desktop: {
      fontSize: "11px",
      lineHeight: "1.7",
    },
  },
  code: {
    mobile: {
      fontSize: "12px",
      lineHeight: "20px",
    },
    desktop: {
      fontSize: "12px",
      lineHeight: "20px",
    },
  },
} as const;

export const careerTimelineTypographyStyle = {
  "--career-timeline-message-font-size":
    CAREER_TIMELINE_TYPOGRAPHY.message.mobile.fontSize,
  "--career-timeline-message-line-height":
    CAREER_TIMELINE_TYPOGRAPHY.message.mobile.lineHeight,
  "--career-timeline-message-font-size-md":
    CAREER_TIMELINE_TYPOGRAPHY.message.desktop.fontSize,
  "--career-timeline-message-line-height-md":
    CAREER_TIMELINE_TYPOGRAPHY.message.desktop.lineHeight,
  "--career-timeline-body-font-size":
    CAREER_TIMELINE_TYPOGRAPHY.body.mobile.fontSize,
  "--career-timeline-body-line-height":
    CAREER_TIMELINE_TYPOGRAPHY.body.mobile.lineHeight,
  "--career-timeline-body-font-size-md":
    CAREER_TIMELINE_TYPOGRAPHY.body.desktop.fontSize,
  "--career-timeline-body-line-height-md":
    CAREER_TIMELINE_TYPOGRAPHY.body.desktop.lineHeight,
  "--career-timeline-meta-font-size":
    CAREER_TIMELINE_TYPOGRAPHY.meta.mobile.fontSize,
  "--career-timeline-meta-line-height":
    CAREER_TIMELINE_TYPOGRAPHY.meta.mobile.lineHeight,
  "--career-timeline-meta-font-size-md":
    CAREER_TIMELINE_TYPOGRAPHY.meta.desktop.fontSize,
  "--career-timeline-meta-line-height-md":
    CAREER_TIMELINE_TYPOGRAPHY.meta.desktop.lineHeight,
  "--career-timeline-feedback-note-font-size":
    CAREER_TIMELINE_TYPOGRAPHY.feedbackNote.mobile.fontSize,
  "--career-timeline-feedback-note-line-height":
    CAREER_TIMELINE_TYPOGRAPHY.feedbackNote.mobile.lineHeight,
  "--career-timeline-feedback-note-font-size-md":
    CAREER_TIMELINE_TYPOGRAPHY.feedbackNote.desktop.fontSize,
  "--career-timeline-feedback-note-line-height-md":
    CAREER_TIMELINE_TYPOGRAPHY.feedbackNote.desktop.lineHeight,
  "--career-timeline-code-font-size":
    CAREER_TIMELINE_TYPOGRAPHY.code.mobile.fontSize,
  "--career-timeline-code-line-height":
    CAREER_TIMELINE_TYPOGRAPHY.code.mobile.lineHeight,
  "--career-timeline-code-font-size-md":
    CAREER_TIMELINE_TYPOGRAPHY.code.desktop.fontSize,
  "--career-timeline-code-line-height-md":
    CAREER_TIMELINE_TYPOGRAPHY.code.desktop.lineHeight,
} as React.CSSProperties;

export const careerTimelineMessageTextClassName =
  "text-[length:var(--career-timeline-message-font-size)] leading-[var(--career-timeline-message-line-height)] md:text-[length:var(--career-timeline-message-font-size-md)] md:leading-[var(--career-timeline-message-line-height-md)]";

export const careerTimelineBodyTextClassName =
  "text-[length:var(--career-timeline-body-font-size)] leading-[var(--career-timeline-body-line-height)] md:text-[length:var(--career-timeline-body-font-size-md)] md:leading-[var(--career-timeline-body-line-height-md)]";

export const careerTimelineMetaTextClassName =
  "text-[length:var(--career-timeline-meta-font-size)] leading-[var(--career-timeline-meta-line-height)] md:text-[length:var(--career-timeline-meta-font-size-md)] md:leading-[var(--career-timeline-meta-line-height-md)]";

export const careerTimelineFeedbackNoteTextClassName =
  "text-[length:var(--career-timeline-feedback-note-font-size)] leading-[var(--career-timeline-feedback-note-line-height)] md:text-[length:var(--career-timeline-feedback-note-font-size-md)] md:leading-[var(--career-timeline-feedback-note-line-height-md)]";

export const careerTimelineCodeTextClassName =
  "text-[length:var(--career-timeline-code-font-size)] leading-[var(--career-timeline-code-line-height)] md:text-[length:var(--career-timeline-code-font-size-md)] md:leading-[var(--career-timeline-code-line-height-md)]";

export const careerTimelineAssistantRichTextClassName = [
  careerTimelineMessageTextClassName,
  "[&_blockquote]:text-[length:var(--career-timeline-message-font-size)]",
  "[&_blockquote]:leading-[var(--career-timeline-message-line-height)]",
  "md:[&_blockquote]:text-[length:var(--career-timeline-message-font-size-md)]",
  "md:[&_blockquote]:leading-[var(--career-timeline-message-line-height-md)]",
  "[&_li]:leading-[var(--career-timeline-message-line-height)]",
  "md:[&_li]:leading-[var(--career-timeline-message-line-height-md)]",
  "[&_ol]:text-[length:var(--career-timeline-message-font-size)]",
  "[&_ol]:leading-[var(--career-timeline-message-line-height)]",
  "md:[&_ol]:text-[length:var(--career-timeline-message-font-size-md)]",
  "md:[&_ol]:leading-[var(--career-timeline-message-line-height-md)]",
  "[&_p]:text-[length:var(--career-timeline-message-font-size)]",
  "[&_p]:leading-[var(--career-timeline-message-line-height)]",
  "md:[&_p]:text-[length:var(--career-timeline-message-font-size-md)]",
  "md:[&_p]:leading-[var(--career-timeline-message-line-height-md)]",
  "[&_ul]:text-[length:var(--career-timeline-message-font-size)]",
  "[&_ul]:leading-[var(--career-timeline-message-line-height)]",
  "md:[&_ul]:text-[length:var(--career-timeline-message-font-size-md)]",
  "md:[&_ul]:leading-[var(--career-timeline-message-line-height-md)]",
  "[&_table]:text-[length:var(--career-timeline-meta-font-size)]",
  "[&_td]:text-[length:var(--career-timeline-meta-font-size)]",
  "[&_th]:text-[length:var(--career-timeline-meta-font-size)]",
  "md:[&_table]:text-[length:var(--career-timeline-meta-font-size-md)]",
  "md:[&_td]:text-[length:var(--career-timeline-meta-font-size-md)]",
  "md:[&_th]:text-[length:var(--career-timeline-meta-font-size-md)]",
  "[&_pre]:text-[length:var(--career-timeline-code-font-size)]",
  "[&_pre]:leading-[var(--career-timeline-code-line-height)]",
  "md:[&_pre]:text-[length:var(--career-timeline-code-font-size-md)]",
  "md:[&_pre]:leading-[var(--career-timeline-code-line-height-md)]",
].join(" ");
