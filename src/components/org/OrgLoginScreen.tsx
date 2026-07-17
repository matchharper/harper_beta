import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { cx, opsTheme } from "@/components/ops/theme";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

export function OrgLoginScreen({ orgId }: { orgId?: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setPending(true);
    setError(null);
    const next = orgId ? `/org?orgId=${encodeURIComponent(orgId)}` : "/org";
    const redirectTo = `${window.location.origin}/auths/callback?next=${encodeURIComponent(next)}`;
    const { error: loginError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (loginError) {
      setError(loginError.message);
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-default px-4 text-neutral-primary">
      <div className="w-full max-w-sm">
        <div className="text-lg font-semibold text-neutral-primary">
          Organization
        </div>
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={() => void handleLogin()}
          disabled={pending}
          className="mt-6 w-full"
        >
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          Google로 계속
        </Button>
        {error ? (
          <div className={cx(opsTheme.errorNotice, "mt-4")}>{error}</div>
        ) : null}
      </div>
    </main>
  );
}
