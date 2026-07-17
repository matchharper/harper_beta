import { Building2, Database, type LucideIcon } from "lucide-react";
import { ActionButton, type PageView } from "./shared";

type ViewTab = {
  icon: LucideIcon;
  label: string;
  view: PageView;
};

const VIEW_TABS: ViewTab[] = [
  {
    icon: Building2,
    label: "Role 목록 관리",
    view: "catalog",
  },
  {
    icon: Database,
    label: "회사 관리",
    view: "company_management",
  },
];

export function ViewTabs({
  onChange,
  view,
}: {
  onChange: (view: PageView) => void;
  view: PageView;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4">
      {VIEW_TABS.map((item) => {
        const Icon = item.icon;
        return (
          <ActionButton
            key={item.view}
            active={view === item.view}
            onClick={() => onChange(item.view)}
          >
            <Icon className="mr-2 inline-flex h-3.5 w-3.5" />
            {item.label}
          </ActionButton>
        );
      })}
    </div>
  );
}
