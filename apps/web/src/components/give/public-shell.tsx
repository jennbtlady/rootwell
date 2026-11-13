import type { ReactNode } from "react";
import type { OrgBranding } from "@maple/core";
import { brandingImageUrl, brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";

/**
 * The frame of every public page (fundraising Phase 1): the nonprofit's header image, logo and
 * colors, its content, and a small "Powered by Rootwell" at the foot. Rootwell appears nowhere
 * else. The settings preview renders this same component, so the preview is the real thing.
 *
 * `embedded` drops the outer padding and the header image for the frame on a nonprofit's own
 * website, which already carries its brand.
 */
export function PublicShell({
  orgName,
  branding,
  logoPath,
  embedded = false,
  children,
  className,
}: {
  orgName: string;
  branding: OrgBranding;
  logoPath: string | null;
  embedded?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const header = embedded ? null : brandingImageUrl(branding.headerImagePath);
  const logo = brandingImageUrl(logoPath);
  return (
    <div style={brandStyle(branding)} className={cn("flex w-full flex-col", className)}>
      {header && (
        // Decorative: the organization's name is in the text right below.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={header} alt="" className="h-32 w-full object-cover sm:h-48" />
      )}
      <div className={cn("mx-auto flex w-full max-w-xl flex-col gap-4", embedded ? "p-4" : "px-4 py-8")}>
        <div className="flex items-center gap-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={`${orgName} logo`} className="h-12 w-auto max-w-40 object-contain" />
          )}
          <p className="text-30 font-semibold text-text-weak">{orgName}</p>
        </div>
        {children}
        <p className="mt-2 text-center text-20 text-text-weak">Powered by Rootwell</p>
      </div>
    </div>
  );
}
