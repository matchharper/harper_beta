import Head from "next/head";
import { useRouter } from "next/router";
import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  OnboardingFrame,
  OnboardingFieldLabel,
} from "@/components/common/onboarding/Onboarding";
import { MuteButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrgWorkspace } from "@/hooks/org/useOrgWorkspace";
import { useOrgLocale } from "@/i18n/org/OrgLocaleProvider";
import { fetchWithInternalAuth } from "@/lib/internalApiClient";
import { buildOrgHref } from "@/lib/org/routes";
import {
  signupErrorMessage,
  type OrgWorkspaceCreateResult,
} from "@/lib/org/signup";
import { queryKeys } from "@/lib/queryKeys";

export function OrgOrganizationCreationPage({
  preview,
}: {
  preview?: { onCreate: () => void; onCancel: () => void };
}) {
  const { locale, c } = useOrgLocale();
  const { workspace, user } = useOrgWorkspace();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [homepageUrl, setHomepageUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const request = useRef<{ homepage: string; id: string } | null>(null);
  const title = c("Organization을 추가하세요", "Add an organization");
  const homeHref = buildOrgHref({ orgId: workspace.workspaceId, page: "home" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    if (preview) {
      preview.onCreate();
      return;
    }
    submitting.current = true;
    setPending(true);
    setError("");
    const homepage = homepageUrl.trim();
    const cacheKey = `org-creation:${user.id}:${workspace.workspaceId}`;
    try {
      if (request.current?.homepage !== homepage) {
        let cached: { homepage?: unknown; id?: unknown } | null = null;
        try {
          cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        } catch {
          /* Optional retry cache. */
        }
        request.current = {
          homepage,
          id:
            cached?.homepage === homepage && typeof cached.id === "string"
              ? cached.id
              : crypto.randomUUID(),
        };
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(request.current));
        } catch {
          /* Same-page retries reuse the ref. */
        }
      }
      const result = await fetchWithInternalAuth<OrgWorkspaceCreateResult>(
        "/api/org/workspace",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceWorkspaceId: workspace.workspaceId,
            homepageUrl: homepage,
            requestId: request.current.id,
          }),
        }
      );
      if (!result.workspaceId) throw new Error("signup_unavailable");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.org.bootstrapAll,
      });
      const navigated = await router.push(
        buildOrgHref({
          orgId: result.workspaceId,
          page: result.status === "member" ? "home" : "onboarding",
        })
      );
      // A later Add action is a new creation, even for the same company.
      // Failed requests keep their ID so a retry cannot create another Org.
      if (navigated) {
        try {
          sessionStorage.removeItem(cacheKey);
        } catch {
          /* Optional retry cache. */
        }
      }
    } catch (cause) {
      setError(signupErrorMessage(cause, locale));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className="min-h-svh bg-bg-basement text-neutral-primary">
      <Head>
        <title>{title}</title>
      </Head>
      <OnboardingFrame
        progressStep={0}
        totalSteps={4}
        showProgress={false}
        flexibleTitle
        title={
          <header className="space-y-3 pt-6">
            <h1 className="text-[24px] font-normal leading-relaxed">{title}</h1>
            <p className="text-sm leading-6 text-neutral-muted">
              {c(
                "회사 홈페이지를 입력해 주세요. 다음 단계에서 회사 정보를 확인할 수 있어요.",
                "Enter the company website to get started. You’ll review the company details next."
              )}
            </p>
          </header>
        }
        footer={
          <div className="flex items-center justify-between gap-3">
            <MuteButton
              size="lg"
              variant="transparent"
              disabled={pending}
              onClick={() =>
                preview ? preview.onCancel() : void router.push(homeHref)
              }
            >
              {c("돌아가기", "Back")}
            </MuteButton>
            <MuteButton
              type="submit"
              form="org-creation-form"
              size="lg"
              variant="dark"
              disabled={pending || !homepageUrl.trim()}
            >
              {pending
                ? c("Organization을 만들고 있어요…", "Creating organization…")
                : c("계속하기", "Continue")}
            </MuteButton>
          </div>
        }
      >
        <form
          id="org-creation-form"
          className="space-y-4"
          onSubmit={(event) => void submit(event)}
        >
          <div className="grid gap-2">
            <OnboardingFieldLabel htmlFor="org-homepage">
              {c("회사 홈페이지", "Company website")}
            </OnboardingFieldLabel>
            <Input
              id="org-homepage"
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={2000}
              placeholder="https://example.com"
              value={homepageUrl}
              disabled={pending}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "org-creation-error" : undefined}
              onChange={(event) => {
                setHomepageUrl(event.target.value);
                setError("");
              }}
            />
          </div>
          {error ? (
            <p
              id="org-creation-error"
              role="alert"
              className="text-sm leading-6 text-critical"
            >
              {error}
            </p>
          ) : null}
        </form>
      </OnboardingFrame>
    </main>
  );
}
