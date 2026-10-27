"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CATEGORY_LABELS, formatDateTime, formatRef } from "@/lib/format";
import type { RequestDto } from "@/lib/types";
import { PriorityBadge } from "./priority-badge";
import { RequestProgress } from "./request-progress";
import { StatusBadge } from "./status-badge";

export function RequestList({
  requests,
  showPeople = false,
}: {
  requests: RequestDto[];
  /** Supervisors also see who created and who is assigned. */
  showPeople?: boolean;
}) {
  const router = useRouter();

  return (
    <>
      {/* md and up: table */}
      <div className="hidden rounded-xl border bg-background md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Category</TableHead>
              {showPeople && <TableHead>Created by</TableHead>}
              {showPeople && <TableHead>Assigned to</TableHead>}
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow
                key={request.id}
                className="cursor-pointer"
                onClick={() => router.push(`/requests/${request.id}`)}
              >
                <TableCell className="font-mono text-xs">
                  <Link
                    href={`/requests/${request.id}`}
                    className="rounded-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {formatRef(request.referenceNo)}
                  </Link>
                </TableCell>
                <TableCell className="max-w-64 truncate font-medium">{request.title}</TableCell>
                <TableCell>
                  <StatusBadge status={request.status} />
                </TableCell>
                <TableCell>
                  <RequestProgress request={request} />
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={request.priority} />
                </TableCell>
                <TableCell>{CATEGORY_LABELS[request.category]}</TableCell>
                {showPeople && <TableCell>{request.createdBy.name}</TableCell>}
                {showPeople && (
                  <TableCell className="text-muted-foreground">
                    {request.assignedTo?.name ?? "—"}
                  </TableCell>
                )}
                <TableCell className="text-muted-foreground">
                  {formatDateTime(request.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* below md: cards */}
      <ul className="space-y-3 md:hidden">
        {requests.map((request) => (
          <li key={request.id}>
            <Link
              href={`/requests/${request.id}`}
              className="block space-y-3 rounded-xl border bg-background p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-muted-foreground">
                    {formatRef(request.referenceNo)}
                  </p>
                  <p className="truncate font-medium">{request.title}</p>
                </div>
                <StatusBadge status={request.status} />
              </div>
              <RequestProgress request={request} />
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <PriorityBadge priority={request.priority} />
                <span>{CATEGORY_LABELS[request.category]}</span>
                {showPeople && <span>· {request.createdBy.name}</span>}
                <span>· {formatDateTime(request.createdAt)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RequestListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-xl border bg-background p-4" aria-busy aria-label="Loading requests">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
          <Skeleton className="hidden h-4 w-24 md:block" />
        </div>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return <p className="text-sm text-muted-foreground">{total} request{total === 1 ? "" : "s"}</p>;
  }
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">{total} requests</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden />
          Prev
        </Button>
        <span className="text-sm" aria-current="page">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
