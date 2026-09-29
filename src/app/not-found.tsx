import type { Metadata } from "next";
import { Hedvig_Letters_Serif } from "next/font/google";
import { AppNotFoundPage } from "@/components/landing/NotFoundPage";

const hedvig = Hedvig_Letters_Serif({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-hedvig",
});

export const metadata: Metadata = {
  title: "404 | Harper",
};

export default function NotFound() {
  return (
    <div className={hedvig.variable}>
      <AppNotFoundPage />
    </div>
  );
}
