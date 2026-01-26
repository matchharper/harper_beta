import { HomeIcon } from "lucide-react";
import Link from "next/link";
import React from "react";

const NotExistingPage = () => {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="text-3xl font-semibold font-hedvig text-white">
        There is no matched page.
      </div>
      <button className="mt-8 text-black px-6 py-3 rounded-md bg-accenta1 transition-all duration-300">
        <Link
          href="/my"
          className="flex items-center gap-2 text-base font-normal"
        >
          Back to main
        </Link>
      </button>
    </div>
  );
};

export default NotExistingPage;
