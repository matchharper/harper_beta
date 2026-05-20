import { Building2 } from "lucide-react";

export const CompanyLogo = ({
  logoUrl,
  name,
  size = "md",
}: {
  logoUrl: string | null;
  name: string;
  size?: "md" | "lg";
}) => {
  const className =
    size === "lg" ? "h-14 w-14 rounded-[8px]" : "h-11 w-11 rounded-[8px]";

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${className} shrink-0 border border-beige900/10 bg-white object-contain p-1`}
      />
    );
  }

  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center border border-beige900/10 bg-beige200 text-beige900`}
    >
      <Building2 className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
    </div>
  );
};
