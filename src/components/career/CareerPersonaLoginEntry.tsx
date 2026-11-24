// career-i18n-skip-file: Dev servers only — open persona test accounts without a sign-in.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { MuteButton } from "@/components/ui/button";
import CareerPersonaDevModal from "./CareerPersonaDevModal";

export default function CareerPersonaLoginEntry() {
  const [open, setOpen] = useState(false);
  // The route answers only on dev servers; deployed builds return 404.
  const available = useQuery({
    queryKey: ["career-dev-personas-available"],
    queryFn: async () =>
      (await fetch("/api/talent/dev-personas?current=1")).ok,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (!available.data) return null;
  return (
    <div data-career-i18n-skip="true" className="fixed bottom-4 right-4 z-50">
      <MuteButton size="sm" onClick={() => setOpen(true)}>
        <UserRound aria-hidden className="size-3.5" />
        페르소나로 보기
      </MuteButton>
      {open ? <CareerPersonaDevModal onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
