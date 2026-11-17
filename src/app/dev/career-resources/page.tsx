import { notFound } from "next/navigation";
import ResourcePreview from "./ResourcePreview";
export const metadata = {
  title: "Harper · 기회와 비교 자료 프리뷰",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ResourcePreview />;
}
