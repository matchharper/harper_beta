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
      <div className="inline-flex min-w-max items-center gap-1 rounded-full border border-beige500/50 bg-beige500/70 p-[3px]">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange(item.id)}
              className={careerCx(
                "inline-flex h-7 items-center rounded-full px-3.5 text-[13px] font-medium transition-all",
                active
                  ? "bg-white text-beige900 shadow-[0_1px_2px_rgba(46,23,6,0.08)]"
                  : "text-beige900/60 hover:bg-beige100/70 hover:text-beige900"
              )}
            >
              <span className="flex items-center gap-2">
                <span>{item.label}</span>
                {typeof item.count === "number" && (
                  <span
                    className={careerCx(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                      active
                        ? "bg-beige700 text-beige50"
                        : "bg-beige900/10 text-beige900/55"
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
