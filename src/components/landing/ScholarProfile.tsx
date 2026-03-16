import { MailPlus, Star } from "lucide-react";
import Image from "next/image";

type Paper = {
  title: string;
  authors: string;
  journal: string;
  citations: number;
  year: number;
  is_featured?: boolean;
};

const papers: Paper[] = [
  {
    title:
      "Observation of a new boson at a mass of 125 GeV with the CMS experiment at the LHC",
    authors:
      "S Chatrchyan, V Khachatryan, AM Sirunyan, A Tumasyan, W Adam, ...",
    journal: "CVPR 2024",
    citations: 660,
    year: 2024,
    is_featured: true,
  },
  {
    title:
      "Muon reconstruction performance of the ATLAS detector in proton–proton colli",
    authors: "Atlas Collaboration",
    journal: "The European Physical Journal C 76",
    citations: 129,
    year: 2025,
    is_featured: false,
  },
  {
    title:
      "Jet energy measurement and its systematic uncertainty in proton–proton collisio",
    authors:
      "Atlas Collaboration atlas. publications@ cern. ch, G Aad, T Abajyan, ...",
    journal: "NeurIPS 2022",
    citations: 68,
    year: 2022,
    is_featured: false,
  },
];

const tags = [
  "Particle Physics",
  "Higgs bosons",
  "Machine learning",
  "Big data",
  "Proteomics",
];

export default function ScholarProfileDark() {
  return (
    <div className="mt-12 w-[1040px] rounded-[28px] border border-zinc-900 bg-[#111113] shadow-2xl p-6">
      {/* Header */}
      <div className="flex justify-between items-start text-left">
        <div className="flex gap-3">
          <Image
            className="w-14 h-14 rounded-full object-cover"
            src="/images/scholar_profile.png"
            width={32}
            height={6324}
            alt="GitHub Profile"
          />

          <div>
            <h1 className="text-lg font-normal text-white">Jonathan Hays</h1>
            <a className="underline text-sm text-neutral-200">
              Queen Mary University of London
            </a>

            <div className="flex flex-wrap gap-4 mt-1">
              {tags.map((tag) => (
                <a key={tag} className="text-sm text-blue-400 hover:underline">
                  {tag}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-6 text-left">
        <div className="grid grid-cols-[1fr_80px_80px] bg-neutral-900 text-sm font-medium px-2 py-1 text-neutral-300">
          <div>제목</div>
          <div className="text-center">인용</div>
          <div className="text-right pr-2">연도</div>
        </div>

        <div className="divide-y divide-neutral-800">
          {papers.map((paper, i) => (
            <div
              key={i}
              className="relative grid grid-cols-[1fr_80px_80px] gap-4 px-4 py-3"
            >
              <div>
                <a className="text-blue-400 hover:underline text-sm font-light">
                  {paper.title}
                </a>
                <p className="text-sm text-neutral-400 mt-0.5">
                  {paper.authors}
                </p>
                <p className="text-sm text-neutral-400">{paper.journal}</p>
              </div>

              <div className="flex items-start justify-end text-sm text-neutral-400">
                {paper.citations}
              </div>
              <div className="flex items-start justify-end text-sm text-neutral-400">
                {paper.year}
              </div>

              {paper.is_featured && (
                <div className="absolute bottom-2 right-1 rounded-full px-2 py-1 bg-blue-500 text-[10px]">
                  Most relevant paper
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="w-full text-white/50 text-sm flex item-center justify-center">
        + 15 more papers
      </div>
    </div>
  );
}
