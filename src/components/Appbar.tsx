import React from "react";
import { useRouter } from "next/router";
import Image from "next/image";

type AppbarProps = {
  back?: boolean;
};

const Appbar = ({ back = true }: AppbarProps) => {
  const router = useRouter();

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
        <button className="hover:text-slate-900">For companies</button>
        <button className="hover:text-slate-900">FAQ</button>
        <button className="hover:text-slate-900">Referral</button>
      </nav>

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <button className="hover:text-slate-900">KO | EN</button>
        <button className="rounded-full bg-xlightgray px-4 py-2 text-sm font-medium text-black">
          Log in
        </button>
      </div>
    </header>
  );
};

export default Appbar;
