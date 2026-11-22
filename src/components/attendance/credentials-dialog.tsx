"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface IssuedCredentials {
  title: string;
  recipientName: string;
  username: string;
  password: string;
  note?: string;
}

interface CredentialsDialogProps {
  credentials: IssuedCredentials | null;
  onClose: () => void;
}

export function CredentialsDialog({
  credentials,
  onClose,
}: CredentialsDialogProps) {
  const [copiedField, setCopiedField] = useState<"all" | "user" | "pass" | null>(
    null
  );

  async function copyText(
    text: string,
    field: "all" | "user" | "pass",
    label: string
  ) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success(`${label} copied to clipboard`);
      window.setTimeout(() => {
        setCopiedField((curr) => (curr === field ? null : curr));
      }, 2000);
    } catch {
      toast.error("Could not copy automatically — please copy manually");
    }
  }

  return (
    <Dialog
      open={credentials !== null}
      onOpenChange={(open) => {
        if (!open) {
          setCopiedField(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            {credentials?.title ?? "Credentials ready"}
          </DialogTitle>
          <DialogDescription>
            {credentials?.note ??
              `Share these sign-in details with ${credentials?.recipientName ?? "the user"} in person. The password is shown only once.`}
          </DialogDescription>
        </DialogHeader>

        {credentials && (
          <div className="space-y-3 rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="truncate text-sm font-medium">
                  {credentials.recipientName}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Username</p>
                <p className="truncate font-mono text-sm font-medium">
                  {credentials.username}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void copyText(credentials.username, "user", "Username")
                }
              >
                {copiedField === "user" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copiedField === "user" ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 border-t pt-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Password</p>
                <p className="truncate font-mono text-sm font-semibold">
                  {credentials.password}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  void copyText(credentials.password, "pass", "Password")
                }
              >
                {copiedField === "pass" ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                )}
                {copiedField === "pass" ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {credentials && (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void copyText(
                  `Name: ${credentials.recipientName}\nUsername: ${credentials.username}\nPassword: ${credentials.password}`,
                  "all",
                  "Credentials"
                )
              }
            >
              {copiedField === "all" ? (
                <Check className="mr-1.5 h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" />
              )}
              {copiedField === "all" ? "Copied all" : "Copy credentials"}
            </Button>
          )}
          <Button
            type="button"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={onClose}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
