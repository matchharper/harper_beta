export type OnboardingJob = { title: string; url: string };

export function readOnboardingJobs(value: unknown): OnboardingJob[] {
  if (!Array.isArray(value)) return [];
  const jobs: OnboardingJob[] = [];
  for (const item of value) {
    if (!item || typeof item.title !== "string" || typeof item.url !== "string") continue;
    try {
      const url = new URL(item.url);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) continue;
      if (!item.title.trim() || jobs.some((job) => job.url === url.href)) continue;
      jobs.push({ title: item.title.trim(), url: url.href });
      if (jobs.length === 2) break;
    } catch { /* Ignore malformed links. */ }
  }
  return jobs;
}

export function onboardingJobMessage(job: OnboardingJob, locale: string) {
  return `${job.url}\n\n${locale === "en" ? `I'd like to hire for this role: ${job.title}.` : `${job.title} 역할을 채용하고 싶어요.`}`;
}
