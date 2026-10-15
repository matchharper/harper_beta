import type { ComponentProps } from "react";

type BrandLogoProps = ComponentProps<"span">;

export function GithubLogo({ className, style, ...props }: BrandLogoProps) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={`inline-block shrink-0 ${className ?? "size-6"}`}
      style={{
        backgroundColor: "currentColor",
        mask: 'url("/svgs/github.svg") center / contain no-repeat',
        WebkitMask: 'url("/svgs/github.svg") center / contain no-repeat',
        ...style,
      }}
    />
  );
}

export function LinkedinLogo({ className, style, ...props }: BrandLogoProps) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={`inline-block shrink-0 ${className ?? "size-6"}`}
      style={{
        background: 'url("/images/logos/linkedin.svg") center / contain no-repeat',
        ...style,
      }}
    />
  );
}

export function SlackLogo({ className, style, ...props }: BrandLogoProps) {
  return (
    <span
      aria-hidden="true"
      {...props}
      className={`inline-block shrink-0 ${className ?? "size-6"}`}
      style={{
        background: 'url("/images/logos/slack.svg") center / contain no-repeat',
        ...style,
      }}
    />
  );
}
