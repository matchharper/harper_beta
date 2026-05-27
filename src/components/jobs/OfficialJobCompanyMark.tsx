import { Building2 } from "lucide-react";

export default function OfficialJobCompanyMark({
  logoUrl,
  name,
  size = "md",
}: {
  logoUrl: string | null;
  name: string;
  size?: "md" | "lg";
}) {
  const sizeClassName =
    size === "lg" ? "h-16 w-16 rounded-[8px]" : "h-12 w-12 rounded-[8px]";

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${sizeClassName} shrink-0 border border-beige900/10 bg-white object-contain p-2`}
      />
    );
  }

  return (
    <div
      className={`${sizeClassName} flex shrink-0 items-center justify-center border border-beige900/10 bg-white/55 text-beige900`}
      aria-hidden="true"
    >
      <Building2 className={size === "lg" ? "h-6 w-6" : "h-5 w-5"} />
    </div>
  );
}
