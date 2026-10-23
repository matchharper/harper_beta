import Head from "next/head";
import { useRouter } from "next/router";
import { useState, type FormEvent, type ReactNode } from "react";
import { CircleCheck, Info, LoaderCircle, UserRound } from "lucide-react";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MuteButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/lib/queryKeys";
import {
  companyEmailActionCopy,
  companyEmailActionNeedsIntroEmail,
  companyEmailActionText,
  companyEmailCandidateStatusLabel,
  type CompanyEmailActionView,
} from "@/lib/email/companyEmailActionCopy";

type LoadedView = Exclude<CompanyEmailActionView, { state: "not_found" }>;

function isView(value: unknown): value is CompanyEmailActionView {
  return Boolean(value && typeof value === "object" && "state" in value);
}

async function requestView(token: string, init?: RequestInit) {
  const response = await fetch(`/api/email-action/${encodeURIComponent(token)}`, {
    cache: "no-store",
    ...init,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!isView(body)) throw new Error("Failed to load the email action");
  return body;
}

function emailActionQueryOptions(token: string) {
  return queryOptions({
    queryKey: queryKeys.org.emailAction(token),
    queryFn: () => requestView(token),
    enabled: Boolean(token),
    staleTime: 0,
    retry: false,
  });
}

function CandidateSummary({ view }: { view: LoadedView }) {
  const experience = [
    view.candidate.latestExperience?.role,
    view.candidate.latestExperience?.companyName,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex gap-3 rounded-lg border border-neutral-1000-a05 bg-bg-weak p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-floating">
        <UserRound className="size-4 text-neutral-muted" />
      </div>
      <div className="min-w-0 text-[13px] leading-5">
        <div className="text-[15px] font-medium text-neutral-primary">
          {view.candidate.name}
        </div>
        {view.candidate.headline ? (
          <p className="mt-0.5 text-neutral-muted">{view.candidate.headline}</p>
        ) : null}
        {experience ? (
          <p className="mt-0.5 text-neutral-muted">{experience}</p>
        ) : null}
        {view.candidate.roleName ? (
          <p className="mt-2 inline-flex rounded-md bg-bg-floating px-2 py-0.5 text-[12px] text-neutral-primary">
            {view.candidate.roleName}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function WebLink({ href, label }: { href: string; label: string }) {
  if (!href) return null;
  return (
    <a
      className="inline-flex text-[13px] font-medium text-link underline underline-offset-2"
      href={href}
      referrerPolicy="no-referrer"
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}

function Outcome({
  description,
  link,
  title,
  view,
}: {
  description?: string;
  link: string;
  title: string;
  view: LoadedView;
}) {
  const copy = companyEmailActionCopy(view.locale);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <CircleCheck className="mt-1 size-4 shrink-0 text-neutral-muted" />
        <div>
          <h1 className="text-[18px] font-medium text-neutral-primary">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 whitespace-pre-line text-[13px] leading-6 text-neutral-muted">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <WebLink href={view.webUrl} label={link} />
        <span className="text-[12px] text-neutral-muted">{copy.closeHint}</span>
      </div>
    </div>
  );
}

export default function CompanyEmailActionPage() {
  const router = useRouter();
  const token =
    typeof router.query.token === "string" ? router.query.token : "";
  const queryClient = useQueryClient();
  const options = emailActionQueryOptions(router.isReady ? token : "");
  const { data: view, isError, isPending } = useQuery(options);
  const [appeal, setAppeal] = useState("");
  const [canceled, setCanceled] = useState(false);
  const submit = useMutation({
    mutationFn: () =>
      requestView(token, {
        body: JSON.stringify({ appeal }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    onSuccess: (next) => queryClient.setQueryData(options.queryKey, next),
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submit.isPending) submit.mutate();
  };
  const onCancel = () => {
    // Cancel records nothing. Mail clients often block closing the tab.
    setCanceled(true);
    window.close();
  };

  const locale = view?.locale ?? "ko";
  const copy = companyEmailActionCopy(locale);

  let content: ReactNode = null;
  if (isPending) {
    content = (
      <div className="flex items-center justify-center gap-2 p-6 text-[13px] text-neutral-muted">
        <LoaderCircle className="size-4 animate-spin" />
        {copy.loading}
      </div>
    );
  } else if (isError || !view) {
    content = (
      <p className="text-[13px] leading-6 text-critical">
        {companyEmailActionCopy("ko").loadError}
        <br />
        {companyEmailActionCopy("en").loadError}
      </p>
    );
  } else if (view.state === "not_found") {
    content = (
      <h1 className="text-[18px] font-medium text-neutral-primary">
        {copy.notFound}
      </h1>
    );
  } else {
    const text = companyEmailActionText(
      view.locale,
      view.action,
      view.candidate.name,
      view.recipient.email
    );
    let body: ReactNode;
    if (canceled) {
      body = <p className="text-[13px] leading-6 text-neutral-muted">{copy.canceled}</p>;
    } else if (view.state === "used" && view.result?.outcome === "done") {
      body = (
        <Outcome
          description={
            view.result.introEmail && view.action === "request_intro"
              ? companyEmailActionText(view.locale, view.action, view.candidate.name, view.result.introEmail).doneDescription
              : text.doneDescription
          }
          link={copy.viewDetails}
          title={text.doneTitle}
          view={view}
        />
      );
    } else if (view.state === "used" || view.state === "handled") {
      const current =
        view.result?.outcome === "handled_elsewhere" ? view.result.current : view.current;
      body = (
        <Outcome
          description={
            current
              ? copy.currentStatus(companyEmailCandidateStatusLabel(current, view.locale))
              : undefined
          }
          link={copy.viewOnWeb}
          title={copy.handled}
          view={view}
        />
      );
    } else if (view.state === "expired") {
      body = <Outcome link={copy.viewOnWeb} title={copy.expired} view={view} />;
    } else {
      const request = view.action === "request_intro";
      body = (
        <form className="space-y-4" noValidate onSubmit={onSubmit}>
          <div>
            <h1 className="text-[18px] font-medium text-neutral-primary">
              {text.title}
            </h1>
            <p className="mt-1 text-[13px] leading-6 text-neutral-muted">
              {text.description}
            </p>
          </div>
          {request && "appealLabel" in text ? (
            <div>
              <label
                className="mb-2 block text-[13px] font-medium text-neutral-primary"
                htmlFor="email-action-appeal"
              >
                {text.appealLabel}
              </label>
              <Textarea
                aria-describedby={view.fieldError ? "email-action-appeal-error" : undefined}
                aria-invalid={Boolean(view.fieldError)}
                className="min-h-28"
                disabled={submit.isPending}
                id="email-action-appeal"
                maxLength={2000}
                onChange={(event) => setAppeal(event.target.value)}
                placeholder={text.appealPlaceholder}
                required
                value={appeal}
              />
              {view.fieldError ? (
                <p
                  className="mt-1 text-[12px] leading-5 text-critical"
                  id="email-action-appeal-error"
                  role="alert"
                >
                  {view.fieldError}
                </p>
              ) : null}
            </div>
          ) : null}
          {!request && view.fieldError ? (
            <p className="text-[12px] leading-5 text-critical" role="alert">
              {view.fieldError}
            </p>
          ) : null}
          {companyEmailActionNeedsIntroEmail(view.action) ? (
            <p className="flex items-center gap-1.5 text-[13px] text-neutral-primary">
              <Info className="size-4 shrink-0 text-neutral-muted" />
              {copy.introEmailNotice(view.recipient.email)}
            </p>
          ) : null}
          {view.state === "error" && view.message ? (
            <p
              className="rounded-md bg-critical-faded px-3 py-2 text-[13px] leading-5 text-critical"
              role="alert"
            >
              {view.message}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <MuteButton
              className="w-full sm:w-auto"
              disabled={submit.isPending}
              onClick={onCancel}
              size="lg"
              type="button"
              variant="default"
            >
              {copy.cancel}
            </MuteButton>
            <MuteButton
              className="w-full sm:w-auto"
              disabled={submit.isPending}
              size="lg"
              type="submit"
              variant="dark"
            >
              {submit.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              {submit.isPending ? copy.submitting : text.confirm}
            </MuteButton>
          </div>
          {submit.isError ? (
            <p className="text-[12px] leading-5 text-critical" role="alert">
              {copy.unknown}
            </p>
          ) : null}
        </form>
      );
    }
    content = (
      <div className="space-y-4">
        <p className="text-[12px] text-neutral-muted">
          {copy.actingAs(view.recipient.name, view.recipient.email)}
        </p>
        <CandidateSummary view={view} />
        {body}
      </div>
    );
  }

  return (
    <main className="min-h-svh bg-bg-default px-4 pb-10 pt-8 text-neutral-primary sm:px-6 sm:pt-16">
      <Head>
        <title>Harper</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <div className="mx-auto w-full max-w-lg rounded-xl border border-neutral-1000-a05 bg-bg-floating p-5 shadow-sm sm:p-6">
        {content}
      </div>
    </main>
  );
}
