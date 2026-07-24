import type { Metadata } from "next";
import "../globals.css";
import ToastProvider from "@/components/toast/ToastProvider";
import ReactQueryProvider from "@/components/Provider";

export const metadata: Metadata = {
  title: "Harper",
  description: "Harper is a platform that helps you find your dream job.",
  icons: {
    icon: "/images/logo.png",
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
