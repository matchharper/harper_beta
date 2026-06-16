import CareerWorkspacePreview from "@/components/career/preview/CareerWorkspacePreview";

const CareerPreviewPage = () => <CareerWorkspacePreview />;

export async function getServerSideProps() {
  if (process.env.NODE_ENV === "production") {
    return { notFound: true };
  }

  return {
    props: {},
  };
}

export default CareerPreviewPage;
