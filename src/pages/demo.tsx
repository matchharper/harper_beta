import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import CareerLandingFooter from "@/components/landing/CareerLandingFooter";
import DemoVideo from "@/components/landing/DemoVideo";

export default function DemoPage() {
  return (
    <>
      <Head>
        <title>Harper Demo</title>
        <meta
          name="description"
          content="See how Harper helps exceptional people discover and connect with their next team."
        />
      </Head>

      <div className="min-h-screen bg-bg-basement text-neutral-primary">
        <header className="">
          <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between px-5 md:px-8">
            <Link
              href="/"
              aria-label="Harper home"
              className="font-hedvig text-[28px] leading-none tracking-tight"
            >
              <Image
                src="/svgs/logov2.svg"
                alt="Harper"
                width={80}
                height={100}
              />
            </Link>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[1280px] flex-col px-5 pt-8 md:px-8 pb-48 md:pt-12">
          <section className="w-full">
            <p className="text-[14px] font-normal uppercase text-black/50">
              Product · Intro
            </p>
            <p className="mt-4 font-hedvig text-[28px] font-extralight md:text-[36px] leading-[1.3] md:leading-[1.5]">
              Harper understands talent on a deeply personal level, learns what
              each company actually needs, and makes the match on both sides
              {"'"} behalf.
            </p>
          </section>

          <div className="grid w-full place-items-center">
            <figure className="mt-10 w-full max-w-[840px] md:mt-14">
              <DemoVideo />
              <p className="mt-3 flex justify-center items-center w-full font-normal text-center text-[13px] text-black/50 sm:text-[14px]">
                Watch the 72-second demo • matchharper.com/demo
              </p>
            </figure>
          </div>
        </main>

        <CareerLandingFooter careerStartHref="/career" locale="en" />
      </div>
    </>
  );
}
