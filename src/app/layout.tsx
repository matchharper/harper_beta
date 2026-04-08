import type { Metadata } from "next";
import "../globals.css";
import ToastProvider from "@/components/toast/ToastProvider";
import ReactQueryProvider from "@/components/Provider";

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
      <body className="font-sans">
        <ReactQueryProvider>
          {children}
          <ToastProvider />
        </ReactQueryProvider>
      </body>
    </html>
  );
}
