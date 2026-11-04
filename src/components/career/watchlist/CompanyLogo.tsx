import { Building2 } from "lucide-react";

export const CompanyLogo = ({
  logoUrl,
  name,
  size = "md",
}: {
  logoUrl: string | null;
  name: string;
  size?: "xs" | "xm" | "sm" | "md" | "lg" | "xl";
}) => {
  const className =
    size === "xs"
      ? "h-4 w-4 rounded-sm"
      : size === "xm"
        ? "h-6 w-6 rounded-md"
        : size === "lg"
          ? "h-14 w-14 rounded-md"
          : size === "xl"
            ? "h-20 w-20 rounded-md"
            : size === "sm"
              ? "h-9 w-9 rounded-lg"
              : "h-11 w-11 rounded-md";

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${className} shrink-0 border border-neutral-1000-a05 bg-bg-default object-contain ${size === "xs" ? "p-0.5" : size === "xm" ? "p-0.5" : "p-1"}`}
      />
    );
  }

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center border border-neutral-1000-a05 bg-bg-weak text-neutral-primary`}
    >
      <Building2
        className={
          size === "xs"
            ? "h-2.5 w-2.5"
            : size === "xm"
              ? "h-3 w-3"
              : size === "lg"
                ? "h-5 w-5"
                : "h-4 w-4"
        }
      />
    </span>
  );
};
