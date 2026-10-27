"use client";

import { Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { RequestFilters, useRequestFilters } from "@/components/request-filters";
import { Pagination, RequestList, RequestListSkeleton } from "@/components/request-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useRequestList } from "@/hooks/use-requests";
import { useAuthStore } from "@/stores/auth-store";

export default function RequestsPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={<RequestListSkeleton />}>
      <Requests />
    </Suspense>
  );
}

function Requests() {
  const user = useAuthStore((s) => s.user);
  const filters = useRequestFilters();
  const { data, isPending, isError, error, refetch } = useRequestList(filters.query);
  const isOperator = user?.role === "OPERATOR";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Requests</h1>
          <p className="text-sm text-muted-foreground">
            {isOperator ? "Requests you have submitted" : "All service requests"}
          </p>
        </div>
        {isOperator && (
          <Button asChild>
            <Link href="/requests/new">
              <Plus aria-hidden />
              New request
            </Link>
          </Button>
        )}
      </div>

      <RequestFilters filters={filters} />

      {isPending ? (
        <RequestListSkeleton />
      ) : isError ? (
        <EmptyState icon={Inbox} title="Could not load requests" hint={error.message}>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </EmptyState>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No requests found"
          hint={
            data.meta.total === 0 && !filters.rawQ && isOperator
              ? "Submit your first request to get started."
              : "Try changing or clearing the filters."
          }
        />
      ) : (
        <>
          <RequestList requests={data.items} showPeople={!isOperator} />
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            onPageChange={(page) => filters.update({ page: String(page) })}
          />
        </>
      )}
    </div>
  );
}
