import type { Metadata } from "next";
import { Heading } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

/** The settings list is the page on a phone; on a computer it sits beside this short note. */
export default function SettingsIndex() {
  return (
    <div className="flex flex-col gap-1">
      <Heading variant="heading30" as="h1" noMargin>
        Settings
      </Heading>
      <p className="max-w-2xl text-30 leading-5 text-text-weak">Choose what to change. Most of these you set up once and rarely touch again.</p>
    </div>
  );
}
