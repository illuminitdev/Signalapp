"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export const PAGE_SIZE = 10;

export function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);
  // A search or filter changes the list size: start again from the first page
  const [seenLength, setSeenLength] = useState(items.length);
  if (seenLength !== items.length) {
    setSeenLength(items.length);
    setPage(1);
  }
  const topRef = useRef<HTMLElement | null>(null);
  const moved = useRef(false);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const el = topRef.current;
    if (el && el.getBoundingClientRect().top < 80) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [current]);

  const go = (p: number) => {
    moved.current = true;
    setPage(p);
  };

  return {
    pageItems: items.slice(start, start + pageSize),
    topRef: topRef as React.RefObject<never>,
    pager:
      items.length > pageSize ? (
        <Pagination
          page={current}
          pages={pages}
          from={start + 1}
          to={Math.min(start + pageSize, items.length)}
          total={items.length}
          onPage={go}
        />
      ) : null,
  };
}

export function Pagination({
  page,
  pages,
  from,
  to,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-[var(--muted)] tabular-nums">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={15} className="-ml-1 mr-1" aria-hidden />
          Previous
        </Button>
        <span className="px-1 text-sm tabular-nums text-[var(--muted)]" aria-current="page">
          Page {page} of {pages}
        </span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight size={15} className="-mr-1 ml-1" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
