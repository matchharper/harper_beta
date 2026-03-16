import React from "react";
import { ExternalLink, Github, MapPin, Star, Plus } from "lucide-react";
import Image from "next/image";

type ContributionLevel = 0 | 1 | 2 | 3 | 4;

type Project = {
  title: string;
  stars: number;
  matchLabel: string;
  description: string;
  tags: string[];
};

const months = [
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb",
];

const weekLabels = [
  { label: "Mon", row: 1 },
  { label: "Wed", row: 3 },
  { label: "Fri", row: 5 },
];

const languageTags = [
  "Python",
  "JavaScript",
  "TypeScript",
  "Go",
  "Rust",
  "HTML",
];

const projects: Project[] = [
  {
    title: "Conversational System",
    stars: 234,
    matchLabel: "Similar to your search",
    description: "STT-LLM-TTS conversational system with open source models",
    tags: ["Python"],
  },
];

const contributionData: ContributionLevel[][] = [
  [
    2, 0, 3, 0, 0, 2, 0, 3, 2, 3, 0, 3, 3, 0, 0, 3, 3, 3, 3, 3, 3, 0, 3, 3, 3,
    3, 4, 3, 3, 3, 0, 3, 3, 0, 3, 4, 3, 0, 0, 0, 0, 0, 3, 0, 3, 3, 3, 3,
  ],
  [
    3, 4, 0, 3, 3, 2, 0, 3, 0, 3, 3, 3, 4, 0, 3, 4, 3, 3, 4, 3, 4, 3, 4, 3, 3,
    3, 4, 3, 4, 3, 3, 4, 3, 4, 3, 4, 2, 3, 3, 2, 4, 2, 3, 3, 0, 2, 2, 0,
  ],
  [
    3, 3, 2, 4, 4, 1, 4, 0, 4, 1, 1, 0, 3, 3, 4, 0, 4, 4, 4, 0, 4, 4, 0, 2, 3,
    3, 1, 3, 3, 3, 3, 3, 1, 3, 4, 4, 3, 3, 2, 3, 4, 2, 4, 3, 3, 4, 1, 0,
  ],
  [
    3, 1, 3, 3, 0, 3, 3, 0, 1, 4, 4, 3, 3, 3, 4, 1, 0, 4, 4, 0, 4, 4, 3, 4, 3,
    3, 4, 4, 0, 0, 0, 0, 3, 1, 0, 3, 1, 1, 1, 0, 3, 3, 3, 3, 3, 3, 1, 4,
  ],
  [
    3, 3, 3, 1, 3, 3, 3, 3, 2, 4, 0, 4, 4, 4, 1, 4, 0, 4, 0, 4, 1, 4, 3, 4, 4,
    2, 4, 3, 4, 4, 1, 4, 1, 2, 4, 4, 0, 2, 4, 0, 0, 4, 3, 1, 3, 3, 4, 0,
  ],
  [
    3, 4, 4, 4, 4, 4, 1, 3, 1, 3, 0, 1, 3, 0, 4, 1, 3, 4, 3, 4, 0, 1, 4, 4, 3,
    1, 4, 4, 1, 0, 4, 4, 0, 1, 4, 0, 3, 0, 0, 4, 4, 0, 0, 3, 0, 1, 4, 4,
  ],
  [
    2, 0, 0, 0, 0, 0, 0, 0, 0, 4, 3, 0, 3, 3, 0, 2, 4, 4, 4, 1, 3, 2, 4, 4, 0,
    0, 0, 4, 1, 3, 3, 0, 1, 0, 3, 3, 0, 0, 3, 3, 0, 0, 3, 1, 3, 0, 0, 3,
  ],
];

function contributionColor(level: ContributionLevel) {
  switch (level) {
    case 0:
      return "bg-[#131B24]";
    case 1:
      return "bg-[#003B11]";
    case 2:
      return "bg-[#006F24]";
    case 3:
      return "bg-[#00A335]";
    case 4:
      return "bg-[#00D753]";
    default:
      return "bg-zinc-800";
  }
}

function AvatarMonogram() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 overflow-hidden">
      <Image
        src="/images/github_profile.png"
        width={64}
        height={64}
        alt="GitHub Profile"
      />
    </div>
  );
}

function ContributionGrid() {
  return (
    <div className="overflow-x-hidden">
      <div className="min-w-[980px]">
        <div className="mb-2 grid grid-cols-[48px_repeat(48,minmax(0,1fr))] gap-2 text-sm text-zinc-400">
          <div />
          {Array.from({ length: 48 }).map((_, i) => {
            const monthLabel = months.find((_, monthIdx) => {
              const start = Math.floor((48 / 12) * monthIdx);
              return i === start;
            });
            return (
              <div
                key={`month-${i}`}
                className="col-span-1 flex items-center justify-start"
              >
                {monthLabel ? (
                  <span className="text-[11px] font-medium text-zinc-500">
                    {monthLabel}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-[48px_repeat(48,minmax(0,1fr))] gap-1.5">
          {contributionData.map((row, rowIdx) => (
            <React.Fragment key={`row-${rowIdx}`}>
              <div className="flex items-center text-[11px] font-medium text-zinc-500">
                {weekLabels.find((item) => item.row === rowIdx)?.label ?? ""}
              </div>
              {row.map((level, colIdx) => (
                <div
                  key={`cell-${rowIdx}-${colIdx}`}
                  className={`aspect-square min-h-[14px] hover:scale-105 transition-all duration-200 hover:outline hover:outline-1 hover:outline-zinc-700 rounded-[2px] ${contributionColor(
                    level
                  )}`}
                />
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="rounded-2xl bg-zinc-900/80 px-4 py-3">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-sm font-medium text-sky-400">
              {project.title}
            </h3>
            <div className="inline-flex items-center gap-1 text-zinc-400">
              <Star className="h-3 w-3" />
              <span className="text-sm font-normal">{project.stars}</span>
            </div>
            <div className="inline-flex items-center gap-1 text-emerald-400">
              {/* <span className="text-[15px] font-medium">
                {project.matchLabel}
              </span> */}
            </div>
          </div>

          <p className="mt-2 max-w-3xl text-sm text-left leading-5 text-zinc-300">
            {project.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="flex flex-row gap-2 items-center rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500"></div>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function CandidateGithubCardDark() {
  return (
    <div className="max-w-[1040px] rounded-[28px] border border-zinc-900 bg-[#111113] shadow-2xl">
      <div className="px-6 py-6 pb-2 md:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AvatarMonogram />
            <div className="min-w-0 flex flex-col items-start justify-center">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-normal tracking-[-0.02em] text-zinc-100">
                  CODINGISCOLOR
                </h1>
              </div>
              <div className="text-base font-light text-sky-400">@thxxx</div>
              <div className="mt-1 inline-flex items-center gap-1 text-sm text-zinc-400">
                <MapPin className="h-4 w-4" />
                <span>New York City, New York, United States</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-zinc-800 px-6 py-4 md:px-8">
        <h2 className="mb-2 text-sm text-left w-full font-normal tracking-[-0.03em] text-zinc-100">
          2894 contributions this year
        </h2>
        <ContributionGrid />
      </div>
      <div className="px-6 py-6 md:px-8">
        <h3 className="w-full text-left mb-2 text-sm font-normal tracking-[-0.02em] text-zinc-100">
          Most Relevant Projects
        </h3>
        <div className="space-y-4">
          {projects.map((project) => (
            <ProjectCard key={project.title} project={project} />
          ))}
        </div>
      </div>
      <div className="w-full text-white/50 mb-4 text-sm flex item-center justify-center">
        + 21 more projects
      </div>
    </div>
  );
}
