import type { ComponentProps, ReactNode } from "react";
import { PreparationComposerView } from "./PreparationComposerView";

/** Plain questions share the original Apply with Harper layout. */
export function QuestionComposer({
  question,
  ...props
}: Omit<ComponentProps<typeof PreparationComposerView>, "body" | "variant"> & {
  question?: ReactNode;
}) {
  return (
    <PreparationComposerView {...props} variant="question" body={question} />
  );
}
