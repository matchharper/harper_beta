import { notFound } from "next/navigation";
import Preview from "./Preview";
import "./liquid-glass.css";

export const metadata = {
  title: "Harper · Liquid glass",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <Preview />;
}
