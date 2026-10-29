import { notFound } from "next/navigation";
import OpportunityPreview from "./OpportunityPreview";

export const metadata = {
  title: "Harper · 기회 탐색 프리뷰",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OpportunityPreview />;
}
