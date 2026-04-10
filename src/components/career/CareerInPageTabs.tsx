import { careerCx } from "./ui/CareerPrimitives";

type TabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
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
      <div className="flex min-w-max items-center gap-7 border-b border-black/5">
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
              <span className="flex items-center gap-2">
                <span>{item.label}</span>
                {typeof item.count === "number" && (
                  <span
                    className={careerCx(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none",
                      active
                        ? "bg-beige900 text-beige100"
                        : "bg-beige900/8 text-beige900/55"
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CareerInPageTabs;
