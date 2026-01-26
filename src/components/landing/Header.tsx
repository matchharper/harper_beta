import React from "react";
import router from "next/router";

const Header = ({ page }: { page: "company" | "candidate" }) => {
  return (
    <header className="z-20 flex items-center justify-between px-4 lg:px-8 py-4 text-sm bg-black/0 fixed top-0 left-0 w-full">
      <div className="text-lg font-light text-white/50 font-garamond w-[10%]">
        harper
      </div>

      <nav className="flex items-center justify-end sm:justify-center gap-8 text-sm sm:text-sm w-[60%] sm:w-[40%]"></nav>
      <div className="w-[40%] sm:w-[10%] text-right">
        {/* <div
          className="font-light cursor-pointer opacity-60 hover:opacity-75"
          onClick={() => {
            const body = {
              local_id: landingId,
              action: "click_candidates",
              is_mobile: isMobile,
            };
            supabase.from("landing_logs").insert(body);
            router.push("/");
          }}
        >
          For candidates
        </div> */}
      </div>
    </header>
  );
};

export default React.memo(Header);
