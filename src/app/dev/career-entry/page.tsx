import { notFound } from "next/navigation";
import EntryPreview from "./EntryPreview";
export const metadata = {
  title: "Career entry preview",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <EntryPreview />;
}
