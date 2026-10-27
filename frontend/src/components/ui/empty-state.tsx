import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./card";

export function EmptyState({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Icon className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{title}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        {children}
      </CardContent>
    </Card>
  );
}
