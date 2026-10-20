import type { Metadata } from "next";
import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Heading,
  HelpText,
  Input,
  Label,
  Paragraph,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { anchorClass } from "@/components/ui/text";

export const metadata: Metadata = { title: "Design system" };

/**
 * Living style guide. Every component and state in one place, for review and for
 * checking contrast and focus by hand. No data, no sign-in.
 */
export default function DesignPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10">
      <div>
        <Heading variant="heading10">Maple Ledger design system</Heading>
        <Paragraph>
          Built on Twilio Paste&apos;s design tokens and component anatomy, owned here. Rules live in{" "}
          <code className="font-mono text-20">docs/design-system.md</code>. Press Tab through this page to check focus rings.
        </Paragraph>
      </div>

      <section className="flex flex-col gap-4">
        <Heading variant="heading20">Type</Heading>
        <Heading variant="heading10">Heading 10: page titles</Heading>
        <Heading variant="heading20">Heading 20: section titles</Heading>
        <Heading variant="heading30">Heading 30: card groups</Heading>
        <Heading variant="heading40">Heading 40: card titles</Heading>
        <Heading variant="heading50">Heading 50: small labels</Heading>
        <Heading variant="heading60">Heading 60: eyebrow</Heading>
        <Paragraph>
          Paragraph: 14px on a 24px line. Most of the app reads at this size. Links look like{" "}
          <Link href="#" className={anchorClass}>
            this link
          </Link>
          . Weak text is for secondary information: <span className="text-text-weak">like this</span>.
        </Paragraph>
      </section>

      <section className="flex flex-col gap-4">
        <Heading variant="heading20">Buttons</Heading>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="destructive_secondary">Destructive secondary</Button>
          <Button variant="link">Link</Button>
          <Button variant="destructive_link">Destructive link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="small">Small primary</Button>
          <Button variant="secondary" size="small">
            Small secondary
          </Button>
          <Button loading>Saving</Button>
          <Button variant="secondary" loading>
            Loading
          </Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button fullWidth variant="secondary" className="sm:w-auto">
            Full width on phones
          </Button>
        </div>
        <HelpText>One primary button per screen. Start button text with a verb. Use a link, not a button, to go somewhere.</HelpText>
      </section>

      <section className="flex flex-col gap-4">
        <Heading variant="heading20">Form fields</Heading>
        <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
          <FormField id="d-name" label="Donor name" required help="First and last name as they sign their checks.">
            {(f) => <Input {...f} defaultValue="Dana Rivera" />}
          </FormField>
          <FormField id="d-email" label="Email" optional>
            {(f) => <Input {...f} type="email" placeholder="name@example.org" />}
          </FormField>
          <FormField id="d-amount" label="Gift amount" required error="Enter an amount greater than zero.">
            {(f) => <Input {...f} inputMode="decimal" insertBefore="$" defaultValue="0" />}
          </FormField>
          <FormField id="d-fund" label="Fund" required>
            {(f) => (
              <Select {...f} defaultValue="general">
                <option value="general">General operating</option>
                <option value="food">Food purchasing</option>
                <option value="building">Building</option>
              </Select>
            )}
          </FormField>
          <FormField id="d-disabled" label="Check number" disabled help="Only for check gifts.">
            {(f) => <Input {...f} disabled defaultValue="1042" />}
          </FormField>
          <FormField id="d-readonly" label="Entered by">
            {(f) => <Input {...f} readOnly defaultValue="Pat Tester" />}
          </FormField>
          <FormField id="d-notes" label="Notes" optional className="sm:col-span-2">
            {(f) => <Textarea {...f} placeholder="Anything the thank-you letter should mention." />}
          </FormField>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="d-raw" required>
            A label on its own
          </Label>
          <HelpText>Default help text.</HelpText>
          <HelpText variant="error">Error help text names the fix.</HelpText>
          <HelpText variant="success">Saved.</HelpText>
          <HelpText variant="warning">This donor has no address on file.</HelpText>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Heading variant="heading20">Alerts</Heading>
        <Alert>
          <AlertTitle>Nightly numbers</AlertTitle>
          <AlertDescription>The dashboard refreshes every night at 2 am. Use Refresh now for today&apos;s gifts.</AlertDescription>
        </Alert>
        <Alert variant="warning">
          <AlertDescription>14 gifts have waited more than two weeks for a thank-you.</AlertDescription>
        </Alert>
        <Alert variant="error">
          <AlertTitle>The import did not finish</AlertTitle>
          <AlertDescription>Row 212 has a date we could not read. Fix it in the file and try again. Nothing was saved.</AlertDescription>
        </Alert>
      </section>

      <section className="flex flex-col gap-4">
        <Heading variant="heading20">Badges</Heading>
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="neutral">Neutral</Badge>
          <Badge variant="success">Posted</Badge>
          <Badge variant="warning">Invitation sent</Badge>
          <Badge variant="error">Needs attention</Badge>
          <Badge variant="new">Sample</Badge>
          <Badge variant="decorative10">Decorative 10</Badge>
          <Badge variant="decorative20">Decorative 20</Badge>
          <Badge variant="decorative30">Decorative 30</Badge>
          <Badge variant="decorative40">Decorative 40</Badge>
          <Badge variant="neutral_counter">12</Badge>
          <Badge variant="error_counter">3</Badge>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Heading variant="heading20">Cards</Heading>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Riverside Food Pantry</CardTitle>
              <CardDescription>Fiscal year starts July. 1,204 constituents.</CardDescription>
            </CardHeader>
            <CardContent>
              <Paragraph noMargin>Cards group one thing. Keep one primary action per card at most.</Paragraph>
            </CardContent>
            <CardFooter>
              <Button size="small">Open</Button>
              <Button variant="secondary" size="small">
                Team
              </Button>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                Loading state <Spinner className="ml-1 align-middle text-text-weak" />
              </CardTitle>
              <CardDescription>A spinner next to the title while numbers load.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Heading variant="heading20">Color roles</Heading>
        <div className="grid gap-2 text-20 sm:grid-cols-3">
          {(
            [
              ["bg-background-body", "Page background"],
            ["bg-background", "Recessed areas, read-only fields"],
            ["bg-background-weakest", "Cards and fields"],
            ["bg-background-primary text-text-inverse", "Primary action"],
            ["bg-background-primary-weakest", "Selected, pressed"],
            ["bg-background-neutral-weakest", "Neutral alert"],
            ["bg-background-success-weakest", "Success"],
            ["bg-background-warning-weakest", "Warning"],
              ["bg-background-error-weakest", "Error"],
            ] as const
          ).map(([cls, label]) => (
            <div key={cls} className={`rounded-30 border border-border-weaker p-3 ${cls}`}>
              <div className="font-mono">{cls.split(" ")[0]}</div>
              <div className="text-text-weak">{label}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
