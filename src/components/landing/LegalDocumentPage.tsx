import React from "react";
import Footer from "./Footer";
import LandingHeader from "./LandingHeader";
import { LegalDocument } from "@/lib/notion/legal";

export type LegalDocumentPageProps = {
  document: LegalDocument | null;
  sourceUrl: string;
  fallbackTitle: string;
};

const LegalDocumentPage = ({
  document,
  sourceUrl,
  fallbackTitle,
}: LegalDocumentPageProps) => {
  return (
    <main className="relative min-h-screen font-inter text-white bg-black w-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.45,
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.32) 0.9px, transparent 0.9px)",
          backgroundSize: "16px 16px",
        }}
      />
      <LandingHeader />

      <section className="relative z-10 w-full lg:w-[94%] mx-auto px-4 md:px-0 pt-24 md:pt-32 pb-16 md:pb-[20vh]">
        <div className="max-w-4xl mx-auto bg-[#0d0d0dcc] backdrop-blur p-6 md:p-10">
          <h1 className="font-garamond text-3xl md:text-5xl font-semibold">
            {document?.title || fallbackTitle}
          </h1>

          {document?.blocks?.length ? (
            <div className="mt-8 flex flex-col gap-5 text-sm md:text-base leading-7 text-white/80">
              {document.blocks.map((block) =>
                block.type === "bulleted_list" ||
                block.type === "numbered_list" ? (
                  <div key={block.id} className="flex items-start gap-3">
                    <span className="mt-[8px] text-xs text-white/70">•</span>
                    <p className="whitespace-pre-line">{block.text}</p>
                  </div>
                ) : (
                  <p key={block.id} className="whitespace-pre-line">
                    {block.text}
                  </p>
                )
              )}
            </div>
          ) : (
            <p className="mt-6 text-sm md:text-base text-hgray700 leading-7">
              The document could not be loaded right now. Please use the source
              link below.
            </p>
          )}

          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block mt-8 text-sm text-accenta1 hover:underline"
          >
            Open original document
          </a>
        </div>
      </section>

      <div className="relative z-10 bg-black">
        <Footer />
      </div>
    </main>
  );
};

export default LegalDocumentPage;
