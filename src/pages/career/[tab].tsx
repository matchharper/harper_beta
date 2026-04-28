import type { GetServerSideProps } from "next";
import CareerWorkspacePage from "@/components/career/CareerWorkspacePage";
import {
  isCareerWorkspaceTab,
  type CareerWorkspaceTab,
} from "@/components/career/CareerWorkspaceNav";

type CareerTabPageProps = {
  activeTab: CareerWorkspaceTab;
};

const CareerTabPage = ({ activeTab }: CareerTabPageProps) => (
  <CareerWorkspacePage activeTab={activeTab} />
);

export const getServerSideProps: GetServerSideProps<CareerTabPageProps> = async (
  context
) => {
  const rawTab = Array.isArray(context.params?.tab)
    ? context.params?.tab[0]
    : context.params?.tab;

  if (!rawTab) {
    return {
      redirect: {
        destination: "/career",
        permanent: false,
      },
    };
  }

  if (rawTab === "home") {
    return {
      redirect: {
        destination: "/career",
        permanent: false,
      },
    };
  }

  if (rawTab === "chat") {
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
