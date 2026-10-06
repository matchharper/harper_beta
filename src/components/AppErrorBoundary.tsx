import React, { type ErrorInfo, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";

type AppErrorBoundaryProps = {
  children: ReactNode;
  resetKey?: string;
};

type AppErrorBoundaryState = {
  error: Error | null;
  signingOut: boolean;
  signOutError: boolean;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return String(error ?? "");
};

const isDomMutationMismatchError = (error: unknown) => {
  const message = getErrorMessage(error);
  const name = error instanceof DOMException ? error.name : "";

  return (
    name === "NotFoundError" ||
    message.includes("removeChild") ||
    message.includes("insertBefore") ||
    message.includes("not a child of this node")
  );
};

class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    signingOut: false,
    signOutError: false,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const isDomMismatch = isDomMutationMismatchError(error);
    const log = isDomMismatch ? console.warn : console.error;

    log("[AppErrorBoundary] client render failed", {
      componentStack: info.componentStack,
      message: error.message,
      name: error.name,
    });
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null, signingOut: false, signOutError: false });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleSignOut = async () => {
    if (this.state.signingOut) return;
    this.setState({ signingOut: true, signOutError: false });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      window.location.reload();
    } catch (error) {
      console.error("[AppErrorBoundary] sign out failed", error);
      this.setState({ signingOut: false, signOutError: true });
    }
  };

  render() {
    const { error, signingOut, signOutError } = this.state;

    if (!error) return this.props.children;

    const isDomMismatch = isDomMutationMismatchError(error);

    return (
      <main
        className="notranslate flex min-h-svh items-center justify-center bg-bg-basement px-5 py-10 text-neutral-primary"
        translate="no"
      >
        <section className="w-full max-w-[420px] rounded-lg border border-neutral-1000-a10 bg-bg-floating p-5 shadow-sm">
          <p className="text-[13px] font-medium text-neutral-soft">Harper</p>
          <h1 className="mt-3 text-xl font-medium leading-7">
            페이지를 다시 불러와야 합니다
          </h1>
          <p className="mt-3 text-sm leading-6 text-neutral-muted">
            {isDomMismatch
              ? "브라우저 번역이나 확장 프로그램이 화면 구조를 바꾸면서 표시가 꼬였습니다."
              : "일시적인 클라이언트 오류가 발생했습니다."}
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-primary bg-primary px-4 text-sm font-medium text-neutral-00"
            >
              새로고침
            </button>
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void this.handleSignOut()}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md border border-neutral-1000-a10 bg-bg-floating px-4 text-sm font-medium text-neutral-primary disabled:cursor-not-allowed disabled:opacity-55"
            >
              {signingOut ? "로그아웃 중…" : "로그아웃"}
            </button>
          </div>
          {signOutError && (
            <p role="alert" className="mt-3 text-sm text-critical">
              로그아웃하지 못했습니다. 다시 시도해 주세요.
            </p>
          )}
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
