"use client";

import React from "react";
import "../globals.css";
import { ArrowRight, Monitor } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/router";
import Appbar from "@/components/Appbar";

const cards = [
  { title: "Machine Learning Engineer", type: "Full time" },
  { title: "AI Research Scientist", type: "Full time" },
  { title: "Investment Banking Expert", type: "Part-time/Remote" },
  { title: "Machine Learning Engineer", type: "Full time" },
];
export default function Home() {
  const navigate = useRouter();

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col px-4 pb-16 pt-6">
        <Appbar />
        {/* Hero */}
        <section className="flex flex-1 flex-col items-center pt-28">
          <h1 className="mb-6 text-center text-3xl font-semibold leading-10 md:text-4xl">
            세계 수준의 테크 팀들이
            <br />
            다음 인재를 찾는 곳
          </h1>

          <p className="font-sans mb-8 text-center text-sm leading-normal text-xgrayblack">
            풀타임, 리모트, 파트타임, 인턴 등
            <br />
            전문성을 알려주신다면, 먼저 프로젝트 제안이 갑니다.
          </p>

          <div className="flex w-full items-center justify-center gap-8">
            <button className=" rounded-full bg-xdarknavy px-[19px] py-[12px] text-[13px] font-light text-white">
              Start Working
            </button>
          </div>
        </section>

        {/* Opportunities */}
        <section className="mt-16">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[18px] font-medium text-slate-800">
              Opportunities.
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {cards.map((card) => (
              <article
                onClick={() => navigate.push("/role")}
                key={card.title}
                className="flex flex-col group justify-between rounded-[6px] outline outline-[1.5px] outline-xgray300 bg-white pl-[15px] pr-[18px] py-[16px] cursor-pointer transition-all duration-300 hover:outline-brightnavy"
              >
                <div>
                  <h3 className="mb-1 text-[16px] font-medium text-slate-900">
                    {card.title}
                  </h3>
                  <div className="flex items-center gap-1 text-[13px] text-brightnavy">
                    <span className="text-[10px]">
                      <Monitor size={16} className="text-brightnavy" />
                    </span>
                    <span>{card.type}</span>
                  </div>
                </div>

                <div className="mt-7 flex items-center justify-between text-[14px] text-slate-400">
                  <span className="text-xgray500">300+ People joined</span>
                  <div className="text-black group-hover:text-brightnavy transition-all duration-300 flex flex-row items-center gap-[2px]">
                    <div>Apply</div>{" "}
                    <ArrowRight
                      size={16}
                      strokeWidth={2.2}
                      className="text-brightnavy group-hover:w-[12px] w-0 transition-all duration-300"
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-12 flex justify-center">
            <button className="flex items-center gap-1 text-sm text-brightnavy cursor-pointer">
              해당하는 역할이 없으신가요? <span>→</span>
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
