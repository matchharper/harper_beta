import type { GetStaticPaths, GetStaticProps } from "next";
import CareerWorkspacePage from "@/components/career/CareerWorkspacePage";
import { isCareerWorkspaceTab, type CareerWorkspaceTab } from "@/components/career/CareerWorkspaceNav";

type CareerTabPageProps = {
  activeTab: CareerWorkspaceTab;
};

type CareerTabPageParams = {
  tab?: string[];
};

const CAREER_TAB_PATHS = [
  "/career",
  "/career/history",
  "/career/watchlist",
  "/career/profile",
];

const CareerTabPage = ({ activeTab }: CareerTabPageProps) => (
  <CareerWorkspacePage activeTab={activeTab} />
);

export const getStaticPaths: GetStaticPaths<
  CareerTabPageParams
> = async () => ({
  paths: CAREER_TAB_PATHS,
  fallback: "blocking",
});

export const getStaticProps: GetStaticProps<
  CareerTabPageProps,
  CareerTabPageParams
> = async (context) => {
  const tabSegments = context.params?.tab ?? [];
  const rawTab = tabSegments[0] ?? null;

  if (!rawTab) {
    return {
      props: {
        activeTab: "home",
      },
    };
  }

  if (tabSegments.length !== 1 || !isCareerWorkspaceTab(rawTab)) {
    return {
      redirect: {
        destination: "/career",
        permanent: false,
      },
    };
  }

  return {
    props: {
      activeTab: rawTab,
    },
  };
};

export default CareerTabPage;
