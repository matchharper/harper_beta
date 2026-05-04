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

const CAREER_TAB_PATHS = [
  "/career",
  "/career/history",
  "/career/profile",
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
