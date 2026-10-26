import { notFound } from "next/navigation";
import SwipePreview from "./SwipePreview";

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SwipePreview />;
}
