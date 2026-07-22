import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ReferralPayoutStatus,
  ReferralPayoutSubmission,
  ReferralPayoutTaxEntityType,
} from "@/lib/referralPayout/types";
import {
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

const BANK_OPTIONS = [
  "KB국민은행",
  "신한은행",
  "우리은행",
  "하나은행",
  "NH농협은행",
  "IBK기업은행",
  "SC제일은행",
  "한국씨티은행",
  "카카오뱅크",
  "토스뱅크",
  "케이뱅크",
  "부산은행",
  "대구은행",
  "광주은행",
  "전북은행",
  "경남은행",
  "제주은행",
  "수협은행",
  "새마을금고",
  "신협",
  "우체국",
  "저축은행",
  "증권사",
] as const;

type ApiResponse = {
  error?: string;
  ok?: boolean;
  status?: ReferralPayoutStatus;
  submittedAt?: string;
};

type FormValues = {
  accuracyConfirmed: boolean;
  address: string;
  bankAccountHolder: string;
  bankAccountNumber: string;
  bankName: string;
  businessRegistrationNumber: string;
  isKoreanTaxResident: boolean;
  legalName: string;
  phone: string;
  privacyConsent: boolean;
  registrationBack: string;
  registrationFront: string;
  taxEntityType: ReferralPayoutTaxEntityType;
};

const INITIAL_FORM: FormValues = {
  accuracyConfirmed: false,
  address: "",
  bankAccountHolder: "",
  bankAccountNumber: "",
  bankName: "",
  businessRegistrationNumber: "",
  isKoreanTaxResident: false,
  legalName: "",
  phone: "",
  privacyConsent: false,
  registrationBack: "",
  registrationFront: "",
  taxEntityType: "individual",
};

function formatDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "long",
    timeZone: "Asia/Seoul",
  }).format(new Date(timestamp));
}

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

async function postPayoutInformation(body: Record<string, unknown>) {
  const response = await fetch(
    "/api/talent/network/referral/payout-information",
    {
      body: JSON.stringify(body),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }
  );
  const data = (await response.json().catch(() => ({}))) as ApiResponse;
  if (!response.ok) {
    throw new Error(data.error || "요청을 처리하지 못했습니다.");
  }
  return data;
}

function Field({
  children,
  htmlFor,
  hint,
  label,
  required = true,
}: {
  children: React.ReactNode;
  htmlFor: string;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-neutral-primary"
      >
        {label}
        {required && (
          <span className="ml-1 text-critical" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p className="mt-1.5 text-[13px] leading-5 text-neutral-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function ConsentRow({
  checked,
  children,
  onChange,
}: {
  checked: boolean;
  children: React.ReactNode;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-1000-a10 bg-bg-floating p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-1000"
      />
      <span className="text-sm leading-6 text-neutral-secondary">
        {children}
      </span>
    </label>
  );
}

export default function ReferralPayoutPage() {
  const tokenRef = useRef("");
  const [status, setStatus] = useState<ReferralPayoutStatus | null>(null);
  const [form, setForm] = useState<FormValues>(INITIAL_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = String(hashParams.get("token") ?? "").trim();
    tokenRef.current = accessToken;
    let active = true;
    const load = async () => {
      if (!accessToken) {
        if (active) {
          setError("지급정보 입력 링크가 올바르지 않습니다.");
          setLoading(false);
        }
        return;
      }
      try {
        const data = await postPayoutInformation({
          action: "status",
          token: accessToken,
        });
        if (!data.status) {
          throw new Error("지급정보 입력 링크를 확인하지 못했습니다.");
        }
        if (active) setStatus(data.status);
      } catch (loadError) {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "지급정보 입력 링크를 확인하지 못했습니다."
        );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const submitted = Boolean(status?.submittedAt);
  const rewardDueAt = useMemo(
    () => formatDate(status?.rewardDueAt ?? null),
    [status?.rewardDueAt]
  );
  const expiresAt = useMemo(
    () => formatDate(status?.accessTokenExpiresAt ?? null),
    [status?.accessTokenExpiresAt]
  );

  const updateForm = <K extends keyof FormValues>(
    field: K,
    value: FormValues[K]
  ) => setForm((current) => ({ ...current, [field]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const token = tokenRef.current;
    if (!token || submitting) return;
    setError("");
    if (!form.isKoreanTaxResident) {
      setError(
        "현재 페이지는 국내 세법상 거주자만 제출할 수 있습니다. 비거주자는 chris@matchharper.com으로 문의해 주세요."
      );
      return;
    }
    if (!form.privacyConsent || !form.accuracyConfirmed) {
      setError("필수 확인 항목에 동의해 주세요.");
      return;
    }

    const submission: ReferralPayoutSubmission = {
      accuracyConfirmed: true,
      address: form.address,
      bankAccountHolder: form.bankAccountHolder,
      bankAccountNumber: form.bankAccountNumber,
      bankName: form.bankName,
      businessRegistrationNumber:
        form.taxEntityType === "sole_proprietor"
          ? form.businessRegistrationNumber
          : null,
      isKoreanTaxResident: true,
      legalName: form.legalName,
      phone: form.phone,
      privacyConsent: true,
      residentRegistrationNumber: `${form.registrationFront}${form.registrationBack}`,
      taxEntityType: form.taxEntityType,
    };

    setSubmitting(true);
    try {
      const data = await postPayoutInformation({
        action: "submit",
        submission,
        token,
      });
      setForm(INITIAL_FORM);
      setStatus((current) =>
        current
          ? {
              ...current,
              submittedAt: data.submittedAt ?? new Date().toISOString(),
            }
          : current
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "지급정보를 제출하지 못했습니다."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>레퍼럴 보상 지급정보 | Harper</title>
        <meta name="robots" content="noindex,nofollow,noarchive" />
        <meta name="referrer" content="no-referrer" />
      </Head>

      <main className="min-h-screen bg-bg-basement px-4 py-8 font-normal text-neutral-primary sm:py-14">
        <div className="mx-auto w-full max-w-[680px]">
          <Link
            href="/"
            className="mb-8 inline-flex items-center text-lg font-medium tracking-[-0.02em] text-neutral-primary"
          >
            Harper
          </Link>

          <section className="overflow-hidden rounded-2xl border border-neutral-1000-a10 bg-bg-floating shadow-sm">
            <header className="border-b border-neutral-1000-a10 px-5 py-6 sm:px-8 sm:py-8">
              <div className="mb-4">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </div>
              <h1 className="text-xl font-medium tracking-[-0.03em]">
                레퍼럴 보상 지급정보
              </h1>
              <p className="mt-3 text-sm leading-6 text-neutral-muted sm:text-base">
                레퍼럴 보상금의 원천징수와 본인 명의 계좌 송금을 위해 필요한
                정보를 입력해 주세요.
              </p>
            </header>

            <div className="px-5 py-6 sm:px-8 sm:py-8">
              {loading && (
                <div
                  className="flex min-h-48 items-center justify-center gap-2 text-sm text-neutral-muted"
                  aria-live="polite"
                >
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  지급정보 입력 링크를 확인하고 있습니다.
                </div>
              )}

              {!loading && error && !status && (
                <div
                  role="alert"
                  className="rounded-xl border border-critical/20 bg-critical/5 p-5 text-sm leading-6 text-critical"
                >
                  {error}
                </div>
              )}

              {!loading && status && submitted && (
                <div role="status" className="py-8 text-center sm:py-12">
                  <CheckCircle2
                    className="mx-auto h-12 w-12 text-positive"
                    aria-hidden
                  />
                  <h2 className="mt-5 text-xl font-medium">
                    지급정보 제출이 완료되었습니다
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-neutral-muted">
                    입력하신 정보는 안전하게 저장되었습니다. 확인이 필요한 경우
                    Harper에서 별도로 연락드리겠습니다.
                  </p>
                  <div className="mx-auto mt-6 max-w-sm rounded-lg bg-bg-weak px-4 py-3 text-sm text-neutral-secondary">
                    제출일 {formatDate(status.submittedAt)}
                  </div>
                </div>
              )}

              {!loading && status && !submitted && (
                <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="rounded-xl border border-neutral-1000-a10 bg-bg-weak p-4 text-sm sm:p-5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-neutral-muted">지급 대상</span>
                      <span className="font-medium text-neutral-primary">
                        {status.referrerName || "추천인"}
                      </span>
                    </div>
                    {status.rewardAmount && (
                      <div className="mt-3 flex items-center justify-between gap-4 border-t border-neutral-1000-a05 pt-3">
                        <span className="text-neutral-muted">세전 보상금</span>
                        <span className="font-medium text-neutral-primary">
                          {status.rewardAmount}
                        </span>
                      </div>
                    )}
                    {rewardDueAt && (
                      <div className="mt-3 flex items-center justify-between gap-4 border-t border-neutral-1000-a05 pt-3">
                        <span className="text-neutral-muted">지급 예정일</span>
                        <span className="font-medium text-neutral-primary">
                          {rewardDueAt}
                        </span>
                      </div>
                    )}
                    <p className="mt-4 border-t border-neutral-1000-a05 pt-4 text-[13px] leading-5 text-neutral-muted">
                      표시된 보상금은 세전 금액이며 관련 세금을 원천징수한 후
                      지급됩니다. 입력 기한은{" "}
                      {expiresAt || "메일 수신 후 14일 이내"}
                      입니다.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-base font-medium">소득자 정보</h2>
                    <div className="mt-4 grid gap-5">
                      <Field htmlFor="tax-entity-type" label="소득자 유형">
                        <select
                          id="tax-entity-type"
                          name="taxEntityType"
                          value={form.taxEntityType}
                          onChange={(event) =>
                            updateForm(
                              "taxEntityType",
                              event.target.value as ReferralPayoutTaxEntityType
                            )
                          }
                          className="h-10 w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-sm text-neutral-primary outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05"
                        >
                          <option value="individual">개인</option>
                          <option value="sole_proprietor">개인사업자</option>
                        </select>
                      </Field>
                      <Field
                        htmlFor="legal-name"
                        label="법적 성명"
                        hint="신분증 및 계좌의 예금주명과 동일하게 입력해 주세요."
                      >
                        <Input
                          id="legal-name"
                          name="legalName"
                          required
                          autoComplete="name"
                          maxLength={100}
                          value={form.legalName}
                          onChange={(event) =>
                            updateForm("legalName", event.target.value)
                          }
                        />
                      </Field>
                      <Field
                        htmlFor="registration-front"
                        label="주민·외국인등록번호"
                        hint="원천징수 및 지급명세서 제출을 위해 암호화하여 저장합니다."
                      >
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <Input
                            id="registration-front"
                            name="registrationFront"
                            required
                            autoComplete="off"
                            inputMode="numeric"
                            minLength={6}
                            maxLength={6}
                            pattern="[0-9]{6}"
                            placeholder="앞 6자리"
                            value={form.registrationFront}
                            onChange={(event) =>
                              updateForm(
                                "registrationFront",
                                onlyDigits(event.target.value, 6)
                              )
                            }
                          />
                          <span className="text-neutral-soft">-</span>
                          <Input
                            id="registration-back"
                            name="registrationBack"
                            aria-label="주민·외국인등록번호 뒤 7자리"
                            required
                            autoComplete="off"
                            inputMode="numeric"
                            minLength={7}
                            maxLength={7}
                            pattern="[0-9]{7}"
                            placeholder="뒤 7자리"
                            type="password"
                            value={form.registrationBack}
                            onChange={(event) =>
                              updateForm(
                                "registrationBack",
                                onlyDigits(event.target.value, 7)
                              )
                            }
                          />
                        </div>
                      </Field>
                      {form.taxEntityType === "sole_proprietor" && (
                        <Field
                          htmlFor="business-registration-number"
                          label="사업자등록번호"
                        >
                          <Input
                            id="business-registration-number"
                            name="businessRegistrationNumber"
                            required
                            autoComplete="off"
                            inputMode="numeric"
                            minLength={10}
                            maxLength={10}
                            pattern="[0-9]{10}"
                            placeholder="숫자 10자리"
                            value={form.businessRegistrationNumber}
                            onChange={(event) =>
                              updateForm(
                                "businessRegistrationNumber",
                                onlyDigits(event.target.value, 10)
                              )
                            }
                          />
                        </Field>
                      )}
                      <Field htmlFor="phone" label="휴대전화번호">
                        <Input
                          id="phone"
                          name="phone"
                          required
                          autoComplete="tel"
                          inputMode="tel"
                          maxLength={13}
                          placeholder="01012345678"
                          value={form.phone}
                          onChange={(event) =>
                            updateForm("phone", event.target.value)
                          }
                        />
                      </Field>
                      <Field
                        htmlFor="address"
                        label="주소"
                        hint="지급명세서 작성에 사용하는 주민등록상 주소를 입력해 주세요."
                      >
                        <Input
                          id="address"
                          name="address"
                          required
                          autoComplete="street-address"
                          maxLength={300}
                          value={form.address}
                          onChange={(event) =>
                            updateForm("address", event.target.value)
                          }
                        />
                      </Field>
                    </div>
                  </div>

                  <div className="border-t border-neutral-1000-a10 pt-8">
                    <h2 className="text-base font-medium">입금 계좌</h2>
                    <p className="mt-2 text-[13px] leading-5 text-neutral-muted">
                      반드시 지급 대상자 본인 명의 계좌를 입력해 주세요.
                    </p>
                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                      <Field htmlFor="bank-name" label="은행">
                        <select
                          id="bank-name"
                          name="bankName"
                          required
                          value={form.bankName}
                          onChange={(event) =>
                            updateForm("bankName", event.target.value)
                          }
                          className="h-10 w-full rounded-md border border-neutral-1000-a10 bg-bg-floating px-3 text-sm text-neutral-primary outline-none focus:border-neutral-400 focus:ring-2 focus:ring-neutral-1000-a05"
                        >
                          <option value="">은행 선택</option>
                          {BANK_OPTIONS.map((bank) => (
                            <option key={bank} value={bank}>
                              {bank}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field htmlFor="bank-account-holder" label="예금주">
                        <Input
                          id="bank-account-holder"
                          name="bankAccountHolder"
                          required
                          autoComplete="off"
                          maxLength={100}
                          value={form.bankAccountHolder}
                          onChange={(event) =>
                            updateForm("bankAccountHolder", event.target.value)
                          }
                        />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field
                          htmlFor="bank-account-number"
                          label="계좌번호"
                          hint="하이픈 없이 숫자만 입력해 주세요. 반드시 본인 계좌 번호가 맞는지 확인해주세요."
                        >
                          <Input
                            id="bank-account-number"
                            name="bankAccountNumber"
                            required
                            autoComplete="off"
                            inputMode="numeric"
                            minLength={6}
                            maxLength={20}
                            value={form.bankAccountNumber}
                            onChange={(event) =>
                              updateForm(
                                "bankAccountNumber",
                                onlyDigits(event.target.value, 20)
                              )
                            }
                          />
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-neutral-1000-a10 pt-8">
                    <h2 className="text-base font-medium">확인 및 동의</h2>
                    <div className="mt-4 space-y-3">
                      <ConsentRow
                        checked={form.isKoreanTaxResident}
                        onChange={(checked) =>
                          updateForm("isKoreanTaxResident", checked)
                        }
                      >
                        본인은 국내 세법상 거주자입니다. 비거주자 또는 법인은 이
                        양식을 제출하지 않고{" "}
                        <a
                          href="mailto:chris@matchharper.com"
                          className="font-medium underline underline-offset-2"
                        >
                          chris@matchharper.com
                        </a>
                        으로 문의해야 합니다. (필수)
                      </ConsentRow>
                      <ConsentRow
                        checked={form.privacyConsent}
                        onChange={(checked) =>
                          updateForm("privacyConsent", checked)
                        }
                      >
                        원천징수, 지급명세서 작성 및 보상금 송금을 위한
                        개인정보와 고유식별정보 처리 고지를 확인했습니다. 자세한
                        내용은{" "}
                        <Link
                          href="/privacy"
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium underline underline-offset-2"
                        >
                          개인정보 처리방침
                        </Link>
                        에서 확인할 수 있습니다. (필수)
                      </ConsentRow>
                      <ConsentRow
                        checked={form.accuracyConfirmed}
                        onChange={(checked) =>
                          updateForm("accuracyConfirmed", checked)
                        }
                      >
                        입력한 정보가 사실과 일치하고 계좌가 본인 명의임을
                        확인합니다. (필수)
                      </ConsentRow>
                    </div>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="rounded-lg border border-critical/20 bg-critical/5 px-4 py-3 text-sm leading-6 text-critical"
                    >
                      {error}
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    disabled={submitting}
                    className="w-full"
                  >
                    {submitting && (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    )}
                    지급정보 제출하기
                  </Button>

                  <div className="flex items-start gap-2 text-[13px] leading-5 text-neutral-muted">
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden
                    />
                    주민·외국인등록번호, 주소, 연락처와 계좌정보는 암호화되어
                    저장되며 지급·세무 처리 권한이 있는 담당자만 취급합니다.
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  return { props: {} };
};
