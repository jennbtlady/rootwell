"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";

export function ConstituentSearch({ base, initial }: { base: string; initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  function submit(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `${base}?q=${encodeURIComponent(q.trim())}` : base);
  }
  return (
    <form onSubmit={submit} role="search" className="flex max-w-xl items-end gap-2">
      <div className="flex-1">
        <Label htmlFor="constituent-q" className="sr-only">
          Search donors
        </Label>
        <Input id="constituent-q" type="search" placeholder="Search by name, email or phone" value={q} onChange={(e) => setQ(e.target.value)} insertBefore={<Search className="size-4" aria-hidden="true" />} />
      </div>
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}
