// career-i18n-skip-file: Local-only preview with synthetic data.
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useState } from "react";
import CareerTextModelPicker from "@/components/career/CareerTextModelPicker";
import CareerUiPreviewModal from "@/components/career/CareerUiPreviewModal";
import { MuteButton } from "@/components/ui/button";
import { MessagesProvider } from "@/i18n/useMessage";
import CareerChatUiPreviewContent from "@/components/career/preview/CareerChatUiPreviewContent";
export default function CareerChatUiPreview() {
  const [galleryOpen, setGalleryOpen] = useState(false);
  return (
    <>
      <Head>
        <title>Career 채팅 UI · Harper Preview</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <MessagesProvider locale="ko" persistPreference={false}>
        <div className="flex flex-wrap items-center gap-2 p-4">
          <CareerTextModelPicker />
          <MuteButton onClick={() => setGalleryOpen(true)}>
            UI 미리보기
          </MuteButton>
        </div>
        <CareerChatUiPreviewContent />
        {galleryOpen && (
          <CareerUiPreviewModal onClose={() => setGalleryOpen(false)} />
        )}
      </MessagesProvider>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async () =>
  process.env.NODE_ENV === "production" ? { notFound: true } : { props: {} };
