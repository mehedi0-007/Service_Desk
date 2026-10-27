"use client";

import { Ban, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useChangeStatus,
  useSupervisors,
  useUpdateRequest,
} from "@/hooks/use-requests";
import { formatRef, PRIORITY_LABELS } from "@/lib/format";
import { allowedActions } from "@/lib/permissions";
import { REQUEST_PRIORITIES, type RequestDto, type RequestPriority, type UserDto } from "@/lib/types";
import { ConfirmDialog } from "./confirm-dialog";

const UNASSIGNED = "unassigned";

export function RequestActions({ request, user }: { request: RequestDto; user: UserDto }) {
  const actions = allowedActions(request, user);
  const changeStatus = useChangeStatus(request.id);
  const updateRequest = useUpdateRequest(request.id);
  const supervisors = useSupervisors(actions.edit);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const ref = formatRef(request.referenceNo);

  if (!actions.cancel && !actions.retry && !actions.edit) return null;

  const cancel = () =>
    changeStatus.mutate(
      { status: "CANCELLED", version: request.version },
      {
        onSuccess: () => toast.success(`${ref} cancelled`),
        onSettled: () => setConfirmCancel(false),
      },
    );

  const retry = () =>
    changeStatus.mutate(
      { status: "QUEUED", version: request.version },
      { onSuccess: () => toast.success(`${ref} queued again`) },
    );

  const update = (changes: { priority?: RequestPriority; assignedToId?: string | null }) =>
    updateRequest.mutate(
      { ...changes, version: request.version },
      { onSuccess: () => toast.success(`${ref} updated`) },
    );

  return (
    <div className="flex flex-wrap items-end gap-3">
      {actions.edit && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={request.priority}
              onValueChange={(priority) => update({ priority: priority as RequestPriority })}
              disabled={updateRequest.isPending}
            >
              <SelectTrigger id="priority" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_PRIORITIES.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="assignee">Assigned to</Label>
            <Select
              value={request.assignedTo?.id ?? UNASSIGNED}
              onValueChange={(id) => update({ assignedToId: id === UNASSIGNED ? null : id })}
              disabled={updateRequest.isPending || supervisors.isPending}
            >
              <SelectTrigger id="assignee" className="w-44">
                <SelectValue placeholder="Loading…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {supervisors.data?.map((supervisor) => (
                  <SelectItem key={supervisor.id} value={supervisor.id}>
                    {supervisor.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      {actions.retry && (
        <Button variant="outline" loading={changeStatus.isPending} onClick={retry}>
          {!changeStatus.isPending && <RotateCcw aria-hidden />}
          Retry
        </Button>
      )}
      {actions.cancel && (
        <>
          <Button variant="destructive" onClick={() => setConfirmCancel(true)}>
            <Ban aria-hidden />
            Cancel request
          </Button>
          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            title={`Cancel ${ref}?`}
            description={
              request.status === "IN_PROGRESS"
                ? "Processing stops at the next step."
                : "The request leaves the queue and will not be processed."
            }
            confirmLabel="Cancel request"
            pending={changeStatus.isPending}
            onConfirm={cancel}
          />
        </>
      )}
    </div>
  );
}
