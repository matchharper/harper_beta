import { notFound } from "next/navigation";
import Preview from "./Preview";
import "./face-loading.css";

export const metadata = {
  title: "Harper · Face loading",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Preview />;
}
