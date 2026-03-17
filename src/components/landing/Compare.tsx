import Reveal from "./Animation/Reveal";

export default function CompareSection() {
  return (
    <section className="relative w-full overflow-hidden bg-black px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col items-center">
        <Reveal>
          <div className="flex flex-col items-center w-full justify-center">
            <h2 className="mt-6 text-center text-xl font-medium leading-[1.1] tracking-[-0.03em] text-white md:text-3xl">
              The best builders are rarely visible on LinkedIn.
              <br />
              They are busy shipping.
            </h2>

            <p className="mt-5 max-w-[720px] text-center text-sm leading-7 text-hgray700 md:text-lg">
              Polished profiles tell you how someone wants to be seen. Real work
              shows what they can actually do.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-14 grid w-full grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-7">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white/90 md:text-base">
                  LinkedIn world
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0E1013]">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="h-3 w-28 rounded-full bg-white/10" />
                  <div className="mt-2 h-2.5 w-20 rounded-full bg-white/5" />
                </div>

                <div className="space-y-3 px-4 py-4">
                  {[
                    ["Title", "Senior ML Engineer"],
                    ["Company", "Well-known startup"],
                    ["School", "Top university"],
                    ["Open to work", "Maybe"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex flex-col items-start gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <span className="text-sm text-white/45">{label}</span>
                      <span className="text-sm text-white/80">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                      <div className="text-[11px] text-white/40">Signals</div>
                      <div className="mt-1 text-sm text-white/80">
                        title, brand
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-center">
                      <div className="text-[11px] text-white/40">Bias risk</div>
                      <div className="mt-1 text-sm text-white/80">
                        polished copy
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {["Profiles", "Titles", "Resumes", "Networking"].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 text-sm text-white/55"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-white/25" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-[#B4FF78]/20 bg-[#B4FF78]/[0.04] p-5 md:p-7">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-white md:text-base">
                  Builder world
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-[#B4FF78]/15 bg-[#0B0E0A]">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-[#B4FF78]" />
                    <div className="text-xs text-white/60">Recent activity</div>
                  </div>
                </div>

                <div className="px-4 py-4">
                  <div className="grid grid-cols-12 gap-1">
                    {Array.from({ length: 48 }).map((_, i) => {
                      const active = [
                        2, 3, 6, 9, 10, 11, 14, 15, 18, 22, 23, 24, 28, 30, 31,
                        35, 39, 40, 41, 45,
                      ].includes(i);
                      return (
                        <div
                          key={i}
                          className={`aspect-square rounded-[3px] ${
                            active ? "bg-[#B4FF78]/80" : "bg-white/5"
                          }`}
                        />
                      );
                    })}
                  </div>

                  <div className="mt-4 space-y-2">
                    {[
                      "Merged PR to a well-known OSS repo",
                      "Maintained production service for 2+ years",
                      "Top-tier publications",
                      "MCP projects",
                    ].map((item) => (
                      <div
                        key={item}
                        className="rounded-xl border border-[#B4FF78]/10 bg-[#B4FF78]/[0.03] px-4 py-3 text-sm text-white/80"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-[#B4FF78]/10 px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[#B4FF78]/10 bg-[#B4FF78]/[0.03] px-4 py-3 text-center">
                      <div className="text-[11px] text-white/40">Signals</div>
                      <div className="mt-1 text-sm text-white">
                        repos, commits
                      </div>
                    </div>
                    <div className="rounded-xl border border-[#B4FF78]/10 bg-[#B4FF78]/[0.03] px-4 py-3 text-center">
                      <div className="text-[11px] text-white/40">Signals</div>
                      <div className="mt-1 text-sm text-white">
                        papers, impact
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                {["Repos", "Commits", "Papers", "Shipping"].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 text-sm text-white/75"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-[#B4FF78]" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-center text-sm leading-7 text-white/65 md:px-6 md:text-base">
          LinkedIn shows careers. GitHub and Scholar show ability.
        </div>
      </div>
    </section>
  );
}
