import type { Metadata } from "next";
import Link from "next/link";
import { HELP, TOPICS } from "@/content/help";
import { Alert, AlertDescription, AlertTitle, Heading } from "@/components/ui";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Heading variant="heading20" as="h1" noMargin>
          Help
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">Short guides to everyday tasks.</p>
      </div>
      <Alert>
        <AlertTitle>Ask a question: coming soon</AlertTitle>
        <AlertDescription>A chat assistant that answers from these guides, in plain language, is on the way. Until then, the guides below cover the common questions.</AlertDescription>
      </Alert>
      {TOPICS.map((topic) => {
        const items = HELP.filter((a) => a.topic === topic);
        if (!items.length) return null;
        return (
          <section key={topic} aria-labelledby={`topic-${topic}`} className="flex flex-col gap-2">
            <Heading id={`topic-${topic}`} variant="heading40" as="h2" noMargin>
              {topic}
            </Heading>
            <ul className="grid gap-2 sm:grid-cols-2">
              {items.map((a) => (
                <li key={a.slug}>
                  <Link href={`/app/help/${a.slug}`} className="block h-full rounded-30 border border-border-weaker bg-background-weakest p-4 outline-none hover:shadow-border-primary focus-visible:shadow-focus">
                    <span className="block text-30 font-semibold leading-5">{a.title}</span>
                    <span className="mt-1 block text-30 leading-5 text-text-weak">{a.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
