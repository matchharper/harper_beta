import OfficialJobsCtaLink from "@/components/jobs/OfficialJobsCtaLink";
import Image from "next/image";
import Link from "next/link";

export default function OfficialJobsHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-beige900/10 bg-beige50 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1160px] items-center justify-between px-4 md:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/svgs/logov2.svg"
            alt="Harper"
            width={72}
            height={33}
            priority
          />
        </Link>
        <nav className="flex items-center gap-4 text-[13px] font-medium text-beige900/58 sm:gap-6">
          <Link
            href="/jobs"
            className="hidden transition hover:text-beige900 sm:block"
          >
            Jobs
          </Link>
          <Link
            href="/company"
            className="hidden transition hover:text-beige900 sm:block"
          >
            For Companies
          </Link>
          <OfficialJobsCtaLink variant="secondary" size="md" />
        </nav>
      </div>
    </header>
  );
}
