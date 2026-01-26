import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import ToastProvider from "@/components/toast/ToastProvider";
import ReactQueryProvider from "@/components/Provider";
import { pretendard } from "./fonts";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Sonus",
  description: "Make everyone communicate beyond language.",
  icons: {
    icon: "/svgs/house.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className + pretendard.variable}>
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
      <ToastProvider />
    </html>
  );
}
