import { useRouter } from "next/router";
import { exportDesignHandoff } from "@/components/career/preview/exportDesignHandoff";
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
const CareerPreviewPage = (props: PreviewPageProps) => {
  const router = useRouter();
  return (
    <>
      {router.query.handoff === "1" && (
        <button
          data-career-i18n-skip="true"
          data-export-omit
          style={{
            position: "fixed",
            bottom: 8,
            right: 8,
            zIndex: 9999,
            padding: 8,
            background: "#fff",
            borderRadius: 8,
            fontSize: 12,
          }}
          onClick={() =>
            void exportDesignHandoff(document.body, {
              filename: "career-screen.html",
            })
          }
        >
          화면 HTML 저장
        </button>
      )}
      <CareerWorkspacePreview
        {...props}
        autoPlayConversation={false}
        initialProfileLinkCount={props.initialProfileLinkCount ?? undefined}
      />
    </>
  );
};

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
