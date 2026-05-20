import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/toast/toast";
import { ADMIN_PAGE_PASSWORD } from "@/lib/admin";
import { isInternalEmail } from "@/lib/internalAccess";
import { useAuthStore } from "@/store/useAuthStore";
import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type AdminAccessGuardProps = {
  children: (args: { canAccessAdminData: true }) => ReactNode;
};

const subscribeStoredAdminPassword = (callback: () => void) => {
  if (typeof window === "undefined") return () => {};

  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
};

const getStoredAdminPasswordSnapshot = () => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("admin_password") === ADMIN_PAGE_PASSWORD;
};

export default function AdminAccessGuard({ children }: AdminAccessGuardProps) {
  const { user, loading: authLoading, init } = useAuthStore();
  const [password, setPassword] = useState("");
  const [isPassed, setIsPassed] = useState(false);
  const hasStoredPassword = useSyncExternalStore(
    subscribeStoredAdminPassword,
    getStoredAdminPasswordSnapshot,
    () => false
  );

  const isInternalAdmin = useMemo(
    () => isInternalEmail(user?.email),
    [user?.email]
  );

  useEffect(() => {
    void init();
  }, [init]);

  const submit = () => {
    if (!isInternalAdmin) {
      showToast({
        message:
          "matchharper.com 계정으로 로그인한 사용자만 접근할 수 있습니다.",
        variant: "white",
      });
      return;
    }

    if (password !== ADMIN_PAGE_PASSWORD) {
      showToast({ message: "Invalid password", variant: "white" });
      return;
    }

    setIsPassed(true);
    localStorage.setItem("admin_password", password);
  };

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white text-[12px] text-black/50">
        Loading admin access...
      </div>
    );
  }

  if (!isInternalAdmin) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white px-4">
        <div className="w-full max-w-[360px] border border-black/10 bg-white p-5 text-center">
          <div className="text-[15px] font-semibold text-black">
            Admin access required
          </div>
          <div className="mt-2 text-[12px] leading-5 text-black/55">
            matchharper.com 계정으로 로그인한 사용자만 접근할 수 있습니다.
          </div>
        </div>
      </div>
    );
  }

  if (!isPassed && !hasStoredPassword) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-white px-4">
        <div className="w-full max-w-[360px] border border-black/10 bg-white p-5">
          <div className="text-[15px] font-semibold text-black">Admin</div>
          <div className="mt-1 text-[12px] leading-5 text-black/55">
            비밀번호를 입력해 주세요.
          </div>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            className="mt-4 h-9 rounded-none border-black/15 bg-white text-[12px]"
          />
          <Button
            type="button"
            onClick={submit}
            className="mt-3 h-9 w-full rounded-none text-[12px]"
          >
            Submit
          </Button>
        </div>
      </div>
    );
  }

  return <>{children({ canAccessAdminData: true })}</>;
}
