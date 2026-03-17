import React from "react";
import { MapPin, Star } from "lucide-react";
import Image from "next/image";
import { ContributionGrid } from "@/components/landing/ContributionGrid";

type Project = {
  title: string;
  stars: number;
  matchLabel: string;
  description: string;
  tags: string[];
};

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

function AvatarMonogram() {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
      <Image
        src="/images/github_profile.png"
        width={64}
        height={64}
        alt="GitHub Profile"
      />
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="rounded-2xl bg-zinc-900/80 px-4 py-3">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

        <div className="flex flex-wrap gap-2 md:justify-end">
          {project.tags.map((tag) => (
            <span
              key={tag}
              className="flex flex-row items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300"
            >
              <div className="h-2 w-2 rounded-full bg-blue-500" />
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
    <div className="w-full max-w-[1040px] overflow-hidden rounded-[28px] border border-zinc-900 bg-[#111113] shadow-2xl">
      <div className="px-6 py-6 pb-2 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AvatarMonogram />
            <div className="min-w-0 flex flex-col items-start justify-center">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-normal tracking-[-0.02em] text-zinc-100">
                  CODINGISCOLOR
                </h1>
              </div>
              <div className="text-base font-light text-sky-400">@thxxx</div>
              <div className="mt-1 inline-flex flex-wrap items-center gap-1 text-left text-sm text-zinc-400">
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
      <div className="mb-4 flex w-full items-center justify-center px-4 text-center text-sm text-white/50">
        + 21 more projects
      </div>
    </div>
  );
}
