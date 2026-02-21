import React from "react";
import { Menu } from "lucide-react";
import { DropdownMenu } from "@/components/ui/menu";
import { useMessages } from "@/i18n/useMessage";

type LandingHeaderProps = {
  onIntroClick: () => void;
  onHowItWorksClick: () => void;
  onPricingClick: () => void;
  onFaqClick: () => void;
  startButton: React.ReactNode;
};

const NavItem = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      className="cursor-pointer hover:opacity-95 px-5 py-2 hover:bg-white/5 rounded-full transition-colors duration-200"
      onClick={onClick}
    >
      {label}
    </button>
  );
};

const LandingHeader = ({
  onIntroClick,
  onHowItWorksClick,
  onPricingClick,
  onFaqClick,
  startButton,
}: LandingHeaderProps) => {
  const { m } = useMessages();

  return (
    <header className="fixed top-0 left-0 z-20 w-full flex items-center justify-between px-0 lg:px-4 h-14 md:h-20 text-sm text-white transition-all duration-300">
      <div className="flex items-center justify-between w-full px-4 md:px-8 h-full">
        <div
          onClick={onIntroClick}
          className="text-[26px] font-garamond font-semibold w-[40%] md:w-[15%]"
        >
          Harper
        </div>
        <nav className="hidden font-normal text-white bg-[#444444aa] backdrop-blur rounded-full md:flex items-center justify-center gap-2 text-xs sm:text-sm px-4 py-2">
          <NavItem label={m.companyLanding.nav.intro} onClick={onIntroClick} />
          <NavItem
            label={m.companyLanding.nav.howItWorks}
            onClick={onHowItWorksClick}
          />
          <NavItem
            label={m.companyLanding.nav.pricing}
            onClick={onPricingClick}
          />
          <NavItem label={m.companyLanding.nav.faq} onClick={onFaqClick} />
        </nav>
        <div className="hidden md:flex w-[10%] md:w-[15%] items-center justify-end">
          {startButton}
        </div>
        <div className="block md:hidden">
          <DropdownMenu
            buttonLabel={<Menu className="w-4 h-4" />}
            items={[
              {
                label: m.companyLanding.nav.intro,
                onClick: onIntroClick,
              },
              {
                label: m.companyLanding.nav.howItWorks,
                onClick: onHowItWorksClick,
              },
              {
                label: m.companyLanding.nav.pricing,
                onClick: onPricingClick,
              },
              {
                label: m.companyLanding.nav.faq,
                onClick: onFaqClick,
              },
            ]}
          />
        </div>
      </div>
    </header>
  );
};

export default React.memo(LandingHeader);
