"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Headset } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ApiError, login } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/format";
import { loginSchema, type LoginValues } from "@/lib/schemas";
import type { Role, UserDto } from "@/lib/types";
import { useAuthStore } from "@/stores/auth-store";

const DEMO_PASSWORD = "Password123!";
const DEMO_ACCOUNTS: { email: string; name: string; role: Role }[] = [
  { email: "operator1@demo.test", name: "Olivia Operator", role: "OPERATOR" },
  { email: "operator2@demo.test", name: "Oscar Operator", role: "OPERATOR" },
  { email: "supervisor@demo.test", name: "Sam Supervisor", role: "SUPERVISOR" },
  { email: "supervisor2@demo.test", name: "Sara Supervisor", role: "SUPERVISOR" },
];

const homeFor = (user: UserDto) =>
  user.role === "SUPERVISOR" ? "/dashboard" : "/requests";

export default function LoginPage() {
  const router = useRouter();
  const { hasHydrated, user, setSession } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in: skip the form.
  useEffect(() => {
    if (hasHydrated && user) router.replace(homeFor(user));
  }, [hasHydrated, user, router]);

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      const session = await login(values.email, values.password);
      setSession(session.accessToken, session.user);
      router.replace(homeFor(session.user));
    } catch (error) {
      setServerError(
        error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      );
    }
  };

  const fillDemo = (email: string) => {
    setValue("email", email, { shouldValidate: true });
    setValue("password", DEMO_PASSWORD, { shouldValidate: true });
    setServerError(null);
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <Headset className="mx-auto size-8" aria-hidden />
          <CardTitle className="text-xl">Service Desk</CardTitle>
          <CardDescription>Sign in to submit and track requests</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby="email-error"
                {...register("email")}
              />
              <FieldError id="email-error" message={errors.email?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby="password-error"
                {...register("password")}
              />
              <FieldError id="password-error" message={errors.password?.message} />
            </div>
            {serverError && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>

          <Separator />

          <section aria-labelledby="demo-accounts" className="space-y-2">
            <h2 id="demo-accounts" className="text-sm font-medium">
              Demo accounts
            </h2>
            <p className="text-xs text-muted-foreground">
              Password for all: <code>{DEMO_PASSWORD}</code>. Click one to fill the form.
            </p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => fillDemo(account.email)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="truncate">{account.email}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {ROLE_LABELS[account.role]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </CardContent>
      </Card>
    </main>
  );
}
