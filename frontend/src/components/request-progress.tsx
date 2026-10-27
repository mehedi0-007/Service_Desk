import { Progress } from "@/components/ui/progress";
import { STAGE_LABELS } from "@/lib/format";
import type { RequestDto } from "@/lib/types";

/** Progress bar with stage label while processing; a short text otherwise. */
export function RequestProgress({
  request,
}: {
  request: Pick<RequestDto, "status" | "progress" | "stage">;
}) {
  if (request.status !== "IN_PROGRESS") {
    return (
      <span className="text-sm text-muted-foreground">
        {request.status === "COMPLETED" ? "100%" : "—"}
      </span>
    );
  }
  const stage = request.stage ? STAGE_LABELS[request.stage] : "Starting";
  return (
    <div className="flex min-w-28 flex-col gap-1">
      <Progress
        value={request.progress}
        aria-label={`Progress ${request.progress}%`}
        className="h-1.5 [&>[data-slot=progress-indicator]]:bg-blue-500"
      />
      <span className="text-xs text-muted-foreground">
        {request.progress}% · {stage}
      </span>
    </div>
  );
}
