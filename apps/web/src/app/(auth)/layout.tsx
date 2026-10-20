import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6 rounded-20 text-50 font-semibold tracking-tight outline-none focus-visible:shadow-focus">
        Maple Ledger
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
