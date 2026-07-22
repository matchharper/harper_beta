import React from "react";
import { useRouter } from "next/router";
import Image from "next/image";
import { BareButton } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { useReferralEntryPointEligibility } from "@/hooks/career/useReferralEntryPointEligibility";

type AppbarProps = {
  back?: boolean;
};

const Appbar = ({ back = true }: AppbarProps) => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const showReferralEntryPoints = useReferralEntryPointEligibility({ user });

  return (
    <header className="flex items-center justify-between py-2 fixed top-0 left-0 w-full z-5 px-4">
      <Image
        onClick={() => router.push("/")}
        className="w-[48px]"
        src="/images/logotext.png"
        alt="logo"
        width={28}
        height={28}
      />

      <nav className="flex items-center gap-8 text-sm text-slate-600">
        <BareButton className="hover:text-slate-900">For companies</BareButton>
        <BareButton className="hover:text-slate-900">FAQ</BareButton>
        {showReferralEntryPoints ? (
          <BareButton className="hover:text-slate-900">Referral</BareButton>
        ) : null}
      </nav>

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <BareButton className="hover:text-slate-900">KO | EN</BareButton>
        <BareButton className="rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-black">
          Log in
        </BareButton>
      </div>
    </header>
  );
};

export default Appbar;
