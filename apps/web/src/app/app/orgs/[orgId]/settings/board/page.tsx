import type { Metadata } from "next";
import { getOrg, listShareLinks } from "@maple/core/services";
import { requireSession, withSession } from "@/lib/session";
import { Heading } from "@/components/ui";
import { BoardSharing } from "@/components/settings/board-sharing";

export const metadata: Metadata = { title: "Board sharing" };

export default async function BoardSettingsPage({ params }: PageProps<"/app/orgs/[orgId]/settings/board">) {
  const { orgId } = await params;
  const session = await requireSession();
  const [org, links] = await withSession(session, (tx) => Promise.all([getOrg(tx, orgId), listShareLinks(tx, orgId)]));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading variant="heading30" as="h1" noMargin>
          Board sharing
        </Heading>
        <p className="mt-1 max-w-2xl text-30 leading-5 text-text-weak">
          Share the dashboard with your board without giving them a login. A link shows the dashboard only: no donor contact details, no exports. You can also invite board members as Board viewers from Team.
        </p>
      </div>
      <BoardSharing orgId={orgId} hideNames={org?.hideBoardNames ?? true} links={links} />
    </div>
  );
}
