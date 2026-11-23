"use client";

import { useState } from "react";
import {
  ChevronDown,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  Lock,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiFetch } from "@/lib/client";
import type { SessionUser } from "@/lib/types";
import { cn } from "@/lib/utils";

interface LoginScreenProps {
  onLogin: (user: SessionUser) => void;
}

const DEMO_ACCOUNTS = [
  { label: "Administrator (HoD)", username: "admin", password: "admin123" },
  { label: "Professor", username: "meera", password: "prof123" },
  { label: "Professor", username: "rajesh", password: "prof123" },
  {
    label: "Student (read-only)",
    username: "bed-01",
    password: "BED-01",
  },
];

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiFetch<{ user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      toast.success(`Welcome, ${data.user.name}`);
      onLogin(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-balance">
              Attendance Tracker
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Faculty and student sign in
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>
              Use the credentials issued by the administrator
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    autoFocus
                    required
                    placeholder="e.g. admin"
                    className="pl-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={submitting}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    placeholder="Your password"
                    className="pl-9 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
                disabled={submitting}
              >
                {submitting && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="rounded-lg border bg-muted/30">
          <button
            type="button"
            aria-expanded={demoOpen}
            aria-controls="demo-accounts-panel"
            onClick={() => setDemoOpen((prev) => !prev)}
            className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
          >
            <span>Demo accounts</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-150",
                demoOpen && "rotate-180"
              )}
              aria-hidden="true"
            />
          </button>
          {demoOpen && (
            <div id="demo-accounts-panel" className="border-t px-3 pb-3 pt-2">
              <ul className="space-y-1">
                {DEMO_ACCOUNTS.map((acc) => (
                  <li key={acc.username}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => {
                        setUsername(acc.username);
                        setPassword(acc.password);
                        setError(null);
                      }}
                    >
                      <span className="truncate">
                        <span className="font-mono font-medium text-foreground">
                          {acc.username}
                        </span>
                        <span className="mx-1.5 text-border">·</span>
                        <span className="font-mono">{acc.password}</span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {acc.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 px-2 text-[11px] text-muted-foreground">
                Click any row to pre-fill credentials.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
