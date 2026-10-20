export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Maple Ledger</h1>
      <p className="max-w-md text-balance text-zinc-600 dark:text-zinc-400">
        A simple donor database for small nonprofits. Phase 0 scaffold. Sign in arrives in the next task.
      </p>
    </main>
  );
}
