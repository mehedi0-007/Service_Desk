"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateRequest } from "@/hooks/use-requests";
import { ApiError } from "@/lib/api";
import { CATEGORY_LABELS, formatRef, PRIORITY_LABELS } from "@/lib/format";
import { createRequestSchema, type CreateRequestValues } from "@/lib/schemas";
import {
  REQUEST_CATEGORIES,
  REQUEST_PRIORITIES,
  type FieldErrorDetail,
} from "@/lib/types";

const FIELDS = ["title", "description", "category", "priority"] as const;

export function RequestForm() {
  const router = useRouter();
  const createRequest = useCreateRequest();
  const {
    register,
    control,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<CreateRequestValues>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: { title: "", description: "", priority: "MEDIUM" },
  });

  const onSubmit = (values: CreateRequestValues) =>
    createRequest.mutate(values, {
      onSuccess: (request) => {
        toast.success(`${formatRef(request.referenceNo)} submitted`);
        router.push(`/requests/${request.id}`);
      },
      onError: (error) => {
        // Show server-side validation messages next to their fields.
        if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
          const details = Array.isArray(error.details) ? (error.details as FieldErrorDetail[]) : [];
          for (const { field, messages } of details) {
            if ((FIELDS as readonly string[]).includes(field)) {
              setError(field as (typeof FIELDS)[number], { message: messages[0] });
            }
          }
          if (details.length) return;
        }
        toast.error(error.message);
      },
    });

  const descriptionLength = watch("description")?.length ?? 0;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="e.g. Laptop does not connect to VPN"
          aria-invalid={!!errors.title}
          aria-describedby="title-error"
          {...register("title")}
        />
        <FieldError id="title-error" message={errors.title?.message} />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="description">Description</Label>
          <span className="text-xs text-muted-foreground">{descriptionLength}/2000</span>
        </div>
        <Textarea
          id="description"
          rows={6}
          placeholder="What happened, and what do you need?"
          aria-invalid={!!errors.description}
          aria-describedby="description-error"
          {...register("description")}
        />
        <FieldError id="description-error" message={errors.description?.message} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger
                  id="category"
                  className="w-full"
                  aria-invalid={!!errors.category}
                  aria-describedby="category-error"
                  onBlur={field.onBlur}
                >
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id="category-error" message={errors.category?.message} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Controller
            control={control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="priority" className="w-full" onBlur={field.onBlur}>
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
            )}
          />
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" loading={createRequest.isPending}>
          Submit request
        </Button>
      </div>
    </form>
  );
}
