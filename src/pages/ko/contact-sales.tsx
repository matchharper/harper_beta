import { showToast } from "@/components/toast/toast";
import { cn } from "@/lib/utils";
import { ArrowRight, Check } from "lucide-react";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useState } from "react";

const fontBig =
  "text-[20px] font-normal leading-[1.4] text-neutral-900 md:text-[26px]";
const fontMedium =
  "text-[15px] font-light leading-[1.4] text-neutral-900 md:text-[17px]";
const fontSmall =
  "text-[14px] font-light leading-[1.25] text-neutral-800 md:text-[16px]";

const initialForm = {
  name: "",
  email: "",
  organization: "",
  purpose: "",
};

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const inputClass =
  "mt-2 h-[43px] w-full rounded-[3px] border border-[#cfcac0] bg-[#fbfaf7] px-3 text-[15px] font-light text-neutral-primary outline-none transition-colors placeholder:text-neutral-muted focus:border-neutral-950";

const textareaClass =
  "mt-2 min-h-[76px] w-full resize-none rounded-[3px] border border-[#cfcac0] bg-[#fbfaf7] px-3 py-3 text-[15px] font-light leading-[1.4] text-neutral-primary outline-none transition-colors placeholder:text-neutral-muted focus:border-neutral-950";

const labelClass = "block text-[13px] font-normal text-neutral-primary";

const selectClass =
  "mt-2 h-[43px] w-full appearance-none rounded-[3px] border border-[#d8d3c9] bg-[#fbfaf7] px-3 text-[15px] font-light text-neutral-primary outline-none transition-colors focus:border-neutral-950";

type TalentSignal = {
  name: string;
  className: string;
  mark?: "ring" | "eye" | "box" | "slash" | "circle";
};

const talentSignals: TalentSignal[] = [
  {
    name: "SAMSUNG",
    className: "text-[19px] font-black tracking-[-0.07em]",
  },
  {
    name: "OpenAI",
    className: "text-[22px] font-semibold tracking-[-0.055em]",
    mark: "ring",
  },
  {
    name: "NVIDIA",
    className: "text-[21px] font-black tracking-[-0.06em]",
    mark: "eye",
  },
  {
    name: "DATADOG",
    className: "text-[17px] font-black tracking-[-0.045em]",
    mark: "box",
  },
  {
    name: "ramp",
    className: "text-[25px] font-black tracking-[-0.06em]",
    mark: "slash",
  },
  {
    name: "KAIST",
    className:
      "border border-neutral-primary px-1 font-serif text-[24px] font-semibold leading-[1.05] tracking-[-0.05em]",
  },
  {
    name: "toss",
    className: "text-[25px] font-black tracking-[-0.06em]",
  },
  {
    name: "Linear",
    className: "text-[22px] font-semibold tracking-[-0.06em]",
    mark: "circle",
  },
];

const requestTypeOptions = [
  "Senior engineering hiring",
  "AI infrastructure / ML talent",
  "Korea or APAC expansion",
  "Founding or leadership role",
  "Other",
];

const footerGroups = [
  [
    "제품",
    "후보자 소개",
    "요구사항 정리",
    "검증된 shortlist",
    "미팅 신청",
    "Candidate brief",
    "회사 페이지",
    "Talent side",
  ],
  [
    "리소스",
    "회사 페이지",
    "Talent side",
    "문의하기",
    "블로그",
    "커뮤니티",
    "도움말",
    "상태",
  ],
  ["기업", "채용", "커뮤니티", "브랜드", "Harper", "파트너", "미래"],
  ["법률", "서비스 약관", "개인정보 처리방침", "보안"],
  ["연결하다", "LinkedIn", "이메일", "X"],
];

export default function HarperContactSalesPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [requestType, setRequestType] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const updateForm = (field: keyof typeof initialForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const continueToDetails = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.email.trim()) {
      showToast({ message: "회사 이메일을 입력해주세요.", variant: "white" });
      return;
    }

    if (!isValidEmail(form.email.trim())) {
      showToast({
        message: "유효한 이메일 주소를 입력해주세요.",
        variant: "white",
      });
      return;
    }

    if (!requestType) {
      showToast({
        message: "도움이 필요한 내용을 선택해주세요.",
        variant: "white",
      });
      return;
    }

    setStep(2);
  };

  const submitForm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const purpose = form.purpose.trim();
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      organization: form.organization.trim(),
      requestType,
      purpose,
      pagePath:
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : router.asPath,
    };

    if (!payload.name) {
      showToast({ message: "이름을 입력해주세요.", variant: "white" });
      return;
    }

    if (!payload.organization) {
      showToast({
        message: "회사 또는 팀명을 입력해주세요.",
        variant: "white",
      });
      return;
    }

    if (!purpose) {
      showToast({ message: "채용 목표를 입력해주세요.", variant: "white" });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/feedback/company-demo-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || data?.error) {
        throw new Error(data?.error ?? "미팅 신청 제출에 실패했습니다.");
      }

      setIsSubmitted(true);
      setForm(initialForm);
      setRequestType("");
      setStep(1);
    } catch (error) {
      showToast({
        message:
          error instanceof Error
            ? error.message
            : "미팅 신청 제출에 실패했습니다.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Harper · 미팅 신청하기</title>
        <meta
          name="description"
          content="Harper와 회사 채용 목표를 공유하고, 바로 인터뷰할 만한 후보자를 소개받으세요."
        />
      </Head>
      <style jsx global>{`
        #crisp-chatbox,
        .crisp-client,
        button[aria-label="Harper 문의 열기"],
        button[aria-label="Open Next.js Dev Tools"],
        [data-nextjs-dev-tools],
        [data-nextjs-dev-tools-button],
        nextjs-portal,
        .nextjs-toast
      `}</style>
      <main className="min-h-screen bg-[#f7f6f1] text-neutral-primary">
        <header className="mx-auto flex h-14 w-full max-w-[1300px] items-center justify-between px-6 xl:px-0">
          <Link
            href="/test_company2"
            className="inline-flex items-center gap-2"
          >
            <span className="flex h-[21px] w-[21px] items-center justify-center rounded-[4px] bg-neutral-950">
              <span className="text-[15px] font-semibold leading-none text-[#f7f6f1]">
                h
              </span>
            </span>
            <span className="text-[17px] font-semibold leading-none tracking-[-0.04em] text-neutral-primary">
              HARPER
            </span>
          </Link>

          <nav className="hidden items-center gap-11 text-[14px] font-light text-neutral-primary md:flex">
            <Link href="/test_company2">제품</Link>
            <Link href="/test_company2">기업</Link>
            <Link href="/test_company2">요금제</Link>
            <Link href="/test_company2">리소스</Link>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-[14px] font-light text-neutral-primary"
            >
              For Talent
            </Link>
            <Link
              href="/test_company2"
              className="hidden h-8 items-center rounded-full border border-[#d7d2c8] px-4 text-[14px] font-light text-neutral-primary md:inline-flex"
            >
              회사 페이지
            </Link>
            <Link
              href="/test_company2"
              className="hidden h-8 items-center rounded-full bg-neutral-950 px-4 text-[14px] font-light text-neutral-00 md:inline-flex"
            >
              돌아가기
            </Link>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-[1300px] gap-8 px-6 pb-[104px] pt-16 lg:grid-cols-2 xl:grid-cols-[635px_635px] xl:gap-[30px] xl:px-0">
          <div>
            <h1 className="max-w-[610px] text-[34px] font-normal leading-[1.22] text-neutral-primary xl:text-[40px]">
              채용 공고로 닿기 어려운 인재를
              <br />
              검증된 소개로 만나보세요
            </h1>

            <div className="mt-5 flex min-h-[235px] max-w-[635px] flex-col justify-between rounded-lg border border-[#e4e1d8] bg-[#fbfaf7] p-4 md:p-5">
              <p className="text-[15px] font-light leading-[1.55] text-neutral-primary">
                Harper는 후보자와 직접 대화해 연봉 범위, 이동 의향, 관심도처럼
                프로필만으로 알 수 없는 정보를 확인합니다. 그래서 회사는 많은
                이력서를 검토하는 대신, 바로 인터뷰할 만한 소수의 후보자만 받을
                수 있습니다.
              </p>

              <div className="mt-9 flex items-center gap-4">
                <Image
                  src="/images/cofounder.png"
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover grayscale"
                />
                <div>
                  <p className="text-[14px] font-normal text-neutral-primary">
                    Harper team
                  </p>
                  <p className="mt-1 text-[13px] font-light text-neutral-muted">
                    High-touch AI headhunter
                  </p>
                </div>
              </div>

              <Link
                href="/test_company2"
                className="mt-7 inline-flex text-[14px] font-light text-[#ff5a1f] hover:text-[#ff5a1f]/80"
              >
                스토리 읽기 →
              </Link>
            </div>
          </div>

          <aside className="self-start rounded-lg border border-[#e4e1d8] bg-[#f3f2ed] p-5 md:min-h-[332px]">
            {isSubmitted ? (
              <div className="flex min-h-[300px] flex-col justify-between">
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-positive/10">
                    <Check className="h-5 w-5 text-positive" />
                  </div>
                  <h2 className={cn(fontBig, "mt-6")}>
                    신청이 접수되었습니다.
                  </h2>
                  <p className={cn(fontMedium, "mt-4 text-neutral-muted")}>
                    남겨주신 내용을 확인한 뒤, 1영업일 내에 연락드리겠습니다.
                  </p>
                </div>
                <Link
                  href="/test_company2"
                  className={cn(
                    fontSmall,
                    "inline-flex h-10 w-fit items-center justify-center rounded-full bg-neutral-950 px-5 text-neutral-00"
                  )}
                >
                  회사 페이지로 돌아가기
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-[28px] font-normal leading-[1.15] text-neutral-primary">
                  팀에 문의하기
                </h2>

                <form
                  onSubmit={step === 1 ? continueToDetails : submitForm}
                  className="mt-7 space-y-4"
                >
                  <label className={labelClass}>
                    회사 이메일*
                    <input
                      value={form.email}
                      onChange={(event) =>
                        updateForm("email", event.target.value)
                      }
                      className={cn(
                        inputClass,
                        step === 1 && "border-neutral-950"
                      )}
                      placeholder="jane@company.co"
                      type="email"
                      autoComplete="email"
                      required
                      readOnly={step === 2}
                    />
                  </label>

                  <label className={labelClass}>
                    무엇을 도와드릴까요?*
                    {step === 1 ? (
                      <select
                        value={requestType}
                        onChange={(event) => setRequestType(event.target.value)}
                        className={cn(
                          selectClass,
                          !requestType && "text-neutral-muted"
                        )}
                        required
                      >
                        <option value="">하나를 선택하세요</option>
                        {requestTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="mt-2 rounded-[3px] border border-[#cfcac0] bg-[#ebe9e2] px-3 py-2 text-[15px] font-light text-neutral-primary">
                        {requestType}
                      </div>
                    )}
                  </label>

                  {step === 2 && (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className={labelClass}>
                          이름*
                          <input
                            value={form.name}
                            onChange={(event) =>
                              updateForm("name", event.target.value)
                            }
                            className={inputClass}
                            autoComplete="name"
                            required
                          />
                        </label>

                        <label className={labelClass}>
                          회사 또는 팀명*
                          <input
                            value={form.organization}
                            onChange={(event) =>
                              updateForm("organization", event.target.value)
                            }
                            className={inputClass}
                            placeholder="회사 또는 팀명"
                            autoComplete="organization"
                            required
                          />
                        </label>
                      </div>

                      <label className={labelClass}>
                        채용 목표*
                        <textarea
                          value={form.purpose}
                          onChange={(event) =>
                            updateForm("purpose", event.target.value)
                          }
                          className={textareaClass}
                          placeholder="예: 한국/APAC 확장을 리드할 senior backend engineer를 찾고 있습니다."
                          required
                        />
                      </label>
                    </>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    {step === 2 && (
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="text-[14px] font-light text-neutral-muted hover:text-neutral-primary"
                      >
                        이전
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        fontSmall,
                        "inline-flex h-[43px] w-fit items-center justify-center gap-2 rounded-full bg-neutral-950 px-6 text-neutral-00 transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                      )}
                    >
                      {isSubmitting
                        ? "신청 중..."
                        : step === 1
                          ? "계속"
                          : "신청하기"}
                      {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                    </button>
                  </div>
                </form>
              </>
            )}
          </aside>
        </section>

        <footer className="bg-[#efeee9] py-16">
          <div className="mx-auto grid w-full max-w-[1300px] grid-cols-2 gap-12 px-6 md:grid-cols-5 xl:px-0">
            {footerGroups.map(([title, ...links]) => (
              <div key={title}>
                <p className="mb-5 text-[13px] font-light text-neutral-muted">
                  {title}
                </p>
                <div className="space-y-3">
                  {links.map((link) => (
                    <p
                      key={link}
                      className="text-[14px] font-light text-neutral-primary"
                    >
                      {link}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-20 flex w-full max-w-[1300px] items-center gap-4 px-6 text-[13px] font-light text-neutral-muted xl:px-0">
            <span>© 2026 Harper</span>
            <span>Verified introductions</span>
          </div>
        </footer>
      </main>
    </>
  );
}
