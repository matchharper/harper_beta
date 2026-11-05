import { notFound } from "next/navigation";
import Preview from "./Preview";
import "./preview.css";

export const metadata = {
  title: "Harper · Design tokens",
  robots: { index: false, follow: false },
};
export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Preview />;
}
