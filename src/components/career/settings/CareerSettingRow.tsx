import React from "react";

export const CareerSettingRow = ({
  action,
  desc,
  mobileActionPlacement = "stacked",
  title,
  variant = "default",
}: {
  action: React.ReactNode;
  desc?: React.ReactNode;
  mobileActionPlacement?: "stacked" | "trailing";
  title: React.ReactNode;
  variant?: "default" | "critical";
}) => (
  <div
    className={[
      "flex gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8",
      mobileActionPlacement === "trailing"
        ? "flex-row items-center justify-between"
        : "flex-col",
    ].join(" ")}
  >
    <div className="min-w-0 flex-1 sm:py-1.5">
      <h3
        className={[
          "text-sm font-normal",
          variant === "critical" ? "text-critical" : "text-neutral-primary",
        ].join(" ")}
      >
        {title}
      </h3>
      {desc && (
        <p className="mt-1 text-sm font-normal leading-5 text-neutral-muted">
          {desc}
        </p>
      )}
    </div>
    <div
      className={[
        "shrink-0 sm:max-w-[360px]",
        React.isValidElement(action) &&
        (action.type === "input" || action.type === "textarea")
          ? "w-full"
          : "",
      ].join(" ")}
    >
      {action}
    </div>
  </div>
);
