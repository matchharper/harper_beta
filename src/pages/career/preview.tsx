import CareerWorkspacePreview from "@/components/career/preview/CareerWorkspacePreview";
import {
  isCareerWorkspaceTab,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";
import type { GetServerSideProps } from "next";

type PreviewPageProps = {
  initialTab: CareerWorkspaceTab | "chat";
  initialOnboardingDone: boolean;
  hideTaskDecisions: boolean;
  initialProfileLinkCount: 0 | 1 | 2 | null;
  initialGmailConnected: boolean;
  taskFeedbackExamples: boolean;
};
const CareerPreviewPage = (props: PreviewPageProps) => (
  <CareerWorkspacePreview
    {...props}
    initialProfileLinkCount={props.initialProfileLinkCount ?? undefined}
  />
);

export const getServerSideProps: GetServerSideProps<PreviewPageProps> = async ({
  query,
}) => {
  if (process.env.NODE_ENV === "production") {
    return { notFound: true };
  }

  return {
    props: {
      initialTab:
        typeof query.tab === "string" && isCareerWorkspaceTab(query.tab)
          ? query.tab
          : "chat",
      hideTaskDecisions: query.taskDecisions === "0",
      initialProfileLinkCount:
        query.profileLinks === "0"
          ? 0
          : query.profileLinks === "1"
            ? 1
            : query.profileLinks === "2"
              ? 2
              : null,
      initialGmailConnected: query.gmail === "1",
      taskFeedbackExamples: query.taskFeedback === "1",
      initialOnboardingDone: query.onboarding !== "1",
    },
  };
};

export default CareerPreviewPage;
