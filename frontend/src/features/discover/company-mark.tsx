"use client";

import { useState } from "react";
import Image from "next/image";
import type { Job } from "@/lib/models";

export function CompanyMark({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl?: string;
}) {
  const [failed, setFailed] = useState<string>();
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("")
      .toLocaleUpperCase() || "?";
  // Only verified, same-origin workspace assets may load in this mark.
  const source =
    logoUrl && /^\/api\/company-logo\/[0-9a-f]{64}\.png$/.test(logoUrl)
      ? logoUrl
      : undefined;

  return (
    <span aria-hidden="true" className="discover-employer-mark">
      <span>{initials}</span>
      {source && failed !== source && (
        <Image
          alt=""
          src={source}
          width={40}
          height={40}
          unoptimized
          onError={() => setFailed(source)}
        />
      )}
    </span>
  );
}

export function employerLogo(job: Job) {
  return job.hiring_employer_verified ? job.company?.logo_url : undefined;
}
