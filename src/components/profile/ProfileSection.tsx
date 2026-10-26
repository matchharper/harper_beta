import type { ReactNode } from "react";

export function ProfileSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="mb-12">
      <div className="mb-2.5 font-medium text-[17px] text-black">{title}</div>
      <div className="text-[15px] leading-6 text-neutral-primary">
        {children}
      </div>
    </section>
  );
}
