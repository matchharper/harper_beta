import type { GetStaticPaths, GetStaticProps } from "next";
import CareerWorkspacePage from "@/components/career/CareerWorkspacePage";
import {
  isCareerWorkspaceTab,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";

type CareerTabPageProps = {
  activeTab: CareerWorkspaceTab;
};

type CareerTabPageParams = {
  tab?: string[];
};

const REDIRECT_TO_HOME_TABS = new Set(["chat", "home"]);
const CAREER_TAB_PATHS = [
  "/career",
  "/career/history",
  "/career/profile",
  "/career/home",
  "/career/chat",
];

const CareerTabPage = ({ activeTab }: CareerTabPageProps) => (
  <CareerWorkspacePage activeTab={activeTab} />
);

export const getStaticPaths: GetStaticPaths<
  CareerTabPageParams
> = async () => ({
  paths: CAREER_TAB_PATHS,
  fallback: false,
});

export const getStaticProps: GetStaticProps<
  CareerTabPageProps,
  CareerTabPageParams
> = async (context) => {
  const rawTab = context.params?.tab?.[0] ?? null;

  if (!rawTab) {
    return {
      props: {
        activeTab: "home",
      },
    };
  }

  if (REDIRECT_TO_HOME_TABS.has(rawTab)) {
    return {
      redirect: {
        destination: "/career",
        permanent: false,
      },
    };
  }

  if (!isCareerWorkspaceTab(rawTab)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      activeTab: rawTab,
    },
  };
};

export default CareerTabPage;
