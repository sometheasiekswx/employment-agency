import { safeUrl } from "@/lib/format";

export function OpportunityListingLink({
  url,
  children,
  className,
  label,
}: {
  url?: string;
  children: string;
  className?: string;
  label?: string;
}) {
  const href = safeUrl(url);
  if (!href) return null;

  return (
    <a
      href={href}
      className={className}
      aria-label={label}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}
