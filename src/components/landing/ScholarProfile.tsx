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
    <div className="mt-12 w-full max-w-[1040px] rounded-[28px] border border-zinc-900 bg-[#111113] p-4 shadow-2xl md:p-6">
      {/* Header */}
      <div className="flex flex-col items-start gap-4 text-left md:flex-row md:justify-between">
        <div className="flex items-start gap-3">
          <Image
            className="h-14 w-14 shrink-0 rounded-full object-cover"
            src="/images/scholar_profile.png"
            width={32}
            height={6324}
            alt="GitHub Profile"
          />

          <div className="min-w-0">
            <h1 className="text-lg font-normal text-white">Jonathan Hays</h1>
            <a className="text-sm text-neutral-200 underline">
              Queen Mary University of London
            </a>

            <div className="mt-2 flex flex-wrap gap-2 md:gap-4">
              {tags.map((tag) => (
                <a
                  key={tag}
                  className="text-xs text-blue-400 hover:underline md:text-sm"
                >
                  {tag}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mt-6 text-left">
        <div className="hidden grid-cols-[minmax(0,1fr)_80px_80px] bg-neutral-900 px-3 py-2 text-sm font-medium text-neutral-300 md:grid">
          <div>제목</div>
          <div className="text-center">인용</div>
          <div className="pr-2 text-right">연도</div>
        </div>

        <div className="divide-y divide-neutral-800">
          {papers.map((paper, i) => (
            <div key={i} className="px-0 py-4 md:px-4 md:py-3">
              <div className="flex flex-col gap-3 md:hidden">
                <div>
                  <a className="text-sm font-light text-blue-400 hover:underline">
                    {paper.title}
                  </a>
                  <p className="mt-1 text-sm text-neutral-400">
                    {paper.authors}
                  </p>
                  <p className="text-sm text-neutral-400">{paper.journal}</p>
                </div>

                <div className="flex items-center gap-4 text-sm text-neutral-400">
                  <span>Citations {paper.citations}</span>
                  <span>Year {paper.year}</span>
                </div>

                {paper.is_featured ? (
                  <div className="w-fit rounded-full bg-blue-500 px-2 py-1 text-[10px] text-white">
                    Most relevant paper
                  </div>
                ) : null}
              </div>

              <div className="relative hidden grid-cols-[minmax(0,1fr)_80px_80px] gap-4 md:grid">
                <div>
                  <a className="text-sm font-light text-blue-400 hover:underline">
                    {paper.title}
                  </a>
                  <p className="mt-0.5 text-sm text-neutral-400">
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
                  <div className="absolute bottom-2 right-1 rounded-full bg-blue-500 px-2 py-1 text-[10px] text-white">
                    Most relevant paper
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex w-full items-center justify-center pt-2 text-center text-sm text-white/50">
        + 15 more papers
      </div>
    </div>
  );
}
