import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async ({ query }) => {
  const searchParams = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, item));
      return;
    }

    if (typeof value === "string") {
      searchParams.append(key, value);
    }
  });

  const destination = searchParams.toString()
    ? `/?${searchParams.toString()}`
    : "/";

  return {
    redirect: {
      destination,
      permanent: false,
    },
  };
};

export default function CompaniesRedirectPage() {
  return null;
}
