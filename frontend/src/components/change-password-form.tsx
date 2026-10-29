"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, changePassword } from "@/lib/api";
import { changePasswordSchema, type ChangePasswordValues } from "@/lib/schemas";
import type { FieldErrorDetail } from "@/lib/types";

const FIELDS = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Repeat new password", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm() {
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const mutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: ChangePasswordValues) =>
      changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      reset();
      toast.success("Password changed. Your other devices were signed out.");
    },
    onError: (error) => {
      // Show server-side validation messages (such as a wrong current password) on their fields.
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR") {
        const details = Array.isArray(error.details) ? (error.details as FieldErrorDetail[]) : [];
        for (const { field, messages } of details) {
          if (FIELDS.some((f) => f.name === field)) {
            setError(field as (typeof FIELDS)[number]["name"], { message: messages[0] });
          }
        }
        if (details.length) return;
      }
      toast.error(error.message);
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="max-w-sm space-y-4"
    >
      {FIELDS.map(({ name, label, autoComplete }) => (
        <div key={name} className="space-y-2">
          <Label htmlFor={name}>{label}</Label>
          <Input
            id={name}
            type="password"
            autoComplete={autoComplete}
            aria-invalid={!!errors[name]}
            aria-describedby={`${name}-error`}
            {...register(name)}
          />
          <FieldError id={`${name}-error`} message={errors[name]?.message} />
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        8–72 characters with at least one letter and one digit.
      </p>
      <Button type="submit" loading={mutation.isPending}>
        Change password
      </Button>
    </form>
  );
}
