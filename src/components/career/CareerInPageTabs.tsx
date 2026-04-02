import { careerCx } from "./ui/CareerPrimitives";

type TabItem<T extends string> = {
  id: T;
  label: string;
};

const CareerInPageTabs = <T extends string>({
  items,
  activeId,
  onChange,
}: {
  items: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
}) => {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-7 border-b border-beige900/10">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={careerCx(
                "border-b-2 px-0 py-3 text-[15px] font-medium transition-colors",
                active
                  ? "border-beige900 text-beige900"
                  : "border-transparent text-beige900/45 hover:text-beige900"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CareerInPageTabs;
