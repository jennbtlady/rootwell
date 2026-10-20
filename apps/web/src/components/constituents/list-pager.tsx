"use client";

import { useRouter } from "next/navigation";
import { Pagination } from "@/components/ui";

export function ListPager({ base, page, pageCount }: { base: string; page: number; pageCount: number }) {
  const router = useRouter();
  return <Pagination page={page} pageCount={pageCount} onPage={(p) => router.push(p === 1 ? base : `${base}?page=${p}`)} />;
}
