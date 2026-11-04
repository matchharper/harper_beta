import Reveal from "./Animation/Reveal";

export default function CompareSection() {
  return (
    <section className="relative w-full overflow-hidden bg-surface-inverse px-4 py-24 md:px-8 md:py-32">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col items-center">
        <Reveal>
          <div className="flex flex-col items-center w-full justify-center">
            <h2 className="mt-6 text-center text-xl font-medium leading-[1.1] tracking-[-0.03em] text-on-inverse md:text-3xl">
              The best builders are rarely visible on LinkedIn.
              <br />
              They are busy shipping.
            </h2>

            <p className="mt-5 max-w-[720px] text-center text-sm leading-7 text-neutral-500 md:text-lg">
              Polished profiles tell you how someone wants to be seen. Real work
              shows what they can actually do.
            </p>
          </div>
        </Reveal>

        <Reveal>
          <div className="mt-14 grid w-full grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
            <div className="rounded-3xl border border-bg-floating/10 bg-bg-floating/5 p-5 md:p-7">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-on-inverse/90 md:text-base">
                  LinkedIn world
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-bg-floating/10 bg-marketing-panel">
                <div className="border-b border-bg-floating/10 px-4 py-3">
                  <div className="h-3 w-28 rounded-full bg-bg-floating/10" />
                  <div className="mt-2 h-2.5 w-20 rounded-full bg-bg-floating/5" />
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
                      className="flex flex-col items-start gap-1 rounded-xl border border-bg-floating/5 bg-bg-floating/5 px-4 py-3 md:flex-row md:items-center md:justify-between"
                    >
                      <span className="text-sm text-on-inverse/45">{label}</span>
                      <span className="text-sm text-on-inverse/80">{value}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-bg-floating/10 px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-bg-floating/5 bg-bg-floating/5 px-4 py-3 text-center">
                      <div className="text-[11px] text-on-inverse/40">Signals</div>
                      <div className="mt-1 text-sm text-on-inverse/80">
                        title, brand
                      </div>
                    </div>
                    <div className="rounded-xl border border-bg-floating/5 bg-bg-floating/5 px-4 py-3 text-center">
                      <div className="text-[11px] text-on-inverse/40">Bias risk</div>
                      <div className="mt-1 text-sm text-on-inverse/80">
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
                    className="flex items-center gap-3 text-sm text-on-inverse/55"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-bg-floating/25" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-marketing-accent/20 bg-marketing-accent/5 p-5 md:p-7">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-on-inverse md:text-base">
                  Builder world
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-marketing-accent/15 bg-marketing-panel">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-marketing-accent" />
                    <div className="text-xs text-on-inverse/60">Recent activity</div>
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
                          className={`aspect-square rounded-sm ${
                            active ? "bg-marketing-accent/80" : "bg-bg-floating/5"
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
                        className="rounded-xl border border-marketing-accent/10 bg-marketing-accent/5 px-4 py-3 text-sm text-on-inverse/80"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-marketing-accent/10 px-4 py-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-marketing-accent/10 bg-marketing-accent/5 px-4 py-3 text-center">
                      <div className="text-[11px] text-on-inverse/40">Signals</div>
                      <div className="mt-1 text-sm text-on-inverse">
                        repos, commits
                      </div>
                    </div>
                    <div className="rounded-xl border border-marketing-accent/10 bg-marketing-accent/5 px-4 py-3 text-center">
                      <div className="text-[11px] text-on-inverse/40">Signals</div>
                      <div className="mt-1 text-sm text-on-inverse">
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
                    className="flex items-center gap-3 text-sm text-on-inverse/75"
                  >
                    <div className="h-1.5 w-1.5 rounded-full bg-marketing-accent" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <div className="mt-8 rounded-2xl border border-bg-floating/10 bg-bg-floating/5 px-5 py-4 text-center text-sm leading-7 text-on-inverse/65 md:px-6 md:text-base">
          LinkedIn shows careers. GitHub and Scholar show ability.
        </div>
      </div>
    </section>
  );
}
