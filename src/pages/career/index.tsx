import React from "react";
import CareerChatPanel from "@/components/career/CareerChatPanel";
import { CareerFlowProvider } from "@/components/career/CareerFlowProvider";
import CareerProgressSidebar from "@/components/career/CareerProgressSidebar";

const Career = () => {
  return (
    <main className="relative min-h-screen bg-hblack000 text-hblack900 font-inter">
      <div className="relative mx-auto grid max-w-[1440px] grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-10 lg:px-8 lg:py-10">
        <CareerFlowProvider>
          <CareerChatPanel />
          <CareerProgressSidebar />
        </CareerFlowProvider>
      </div>
    </main>
  );
};

export default Career;
