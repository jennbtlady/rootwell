import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HELP } from "@/content/help";
import { Heading } from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

export function generateStaticParams() {
  return HELP.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: PageProps<"/app/help/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const a = HELP.find((x) => x.slug === slug);
  return { title: a ? `${a.title}: Help` : "Help" };
}

export default async function HelpArticlePage({ params }: PageProps<"/app/help/[slug]">) {
  const { slug } = await params;
  const a = HELP.find((x) => x.slug === slug);
  if (!a) notFound();
  return (
    <article className="flex max-w-2xl flex-col gap-4">
      <Link href="/app/help" className={`${anchorClass} text-30`}>
        Help
      </Link>
      <div>
        <Heading variant="heading20" as="h1" noMargin>
          {a.title}
        </Heading>
        <p className="mt-1 text-40 leading-6 text-text-weak">{a.summary}</p>
      </div>
      {a.sections.map((s, i) => (
        <section key={i} className="flex flex-col gap-2">
          {s.heading && (
            <Heading variant="heading40" as="h2" noMargin>
              {s.heading}
            </Heading>
          )}
          {s.text?.map((t) => (
            <p key={t} className="text-40 leading-7">
              {t}
            </p>
          ))}
          {s.steps && (
            <ol className="ml-5 flex list-decimal flex-col gap-1 text-40 leading-7">
              {s.steps.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          )}
          {s.link && (
            <p className="text-40 leading-7">
              <Link href={s.link.href} className={anchorClass}>
                {s.link.label}
              </Link>
            </p>
          )}
        </section>
      ))}
    </article>
  );
}
