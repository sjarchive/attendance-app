"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/client";
import type { ImportSummary } from "@/lib/types";

interface CsvImportDialogProps {
  courseId: string;
  onImported: () => void;
}

/** Small numbered stat block used in the import results panel. */
function ImportStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-2.5 py-2">
      <p className="text-base font-semibold leading-none tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

export function CsvImportDialog({ courseId, onImported }: CsvImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lineCount = csv.length === 0 ? 0 : csv.split("\n").length;

  function resetState() {
    setCsv("");
    setFileName(null);
    setResult(null);
    setPending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetState();
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsv(text);
    };
    reader.onerror = () => {
      toast.error("Could not read the selected file");
    };
    reader.readAsText(file);
    event.target.value = ""; // allow re-selecting the same file later
  }

  async function handleSubmit() {
    if (csv.trim().length === 0) {
      toast.error("Paste or upload a CSV first");
      return;
    }
    setPending(true);
    try {
      const body = await apiFetch<{ summary: ImportSummary }>(
        "/api/students/import",
        {
          method: "POST",
          body: JSON.stringify({ courseId, csv }),
        }
      );
      setResult(body.summary);
      toast.success(
        `Imported — ${body.summary.created} created, ${body.summary.updated} updated, ${body.summary.reactivated} reactivated`
      );
      onImported();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Import CSV
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import students from CSV</DialogTitle>
            <DialogDescription>
              Two columns per line: roll number, name. A header row is optional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={pending}
              >
                <FileUp
                  className="mr-1.5 h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
                Choose file
              </Button>
              <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {fileName ?? "No file chosen — paste below instead"}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="csv-content" className="text-xs">
                CSV content
              </Label>
              <Textarea
                id="csv-content"
                value={csv}
                onChange={(e) => setCsv(e.target.value)}
                placeholder={"BED1-12, Ravi Kumar\nBED1-13, Priya Nair"}
                rows={7}
                className="font-mono text-xs"
                disabled={pending}
              />
              <p className="text-right text-xs text-muted-foreground">
                {csv.length} {csv.length === 1 ? "char" : "chars"} ·{" "}
                {lineCount} {lineCount === 1 ? "line" : "lines"}
              </p>
            </div>

            {result && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  Results
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    · {result.totalRows}{" "}
                    {result.totalRows === 1 ? "row" : "rows"} parsed
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <ImportStat value={result.created} label="Created" />
                  <ImportStat value={result.updated} label="Name updated" />
                  <ImportStat value={result.reactivated} label="Reactivated" />
                  <ImportStat value={result.skipped} label="Skipped" />
                </div>
                {result.errors.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3">
                    <p className="text-xs font-medium text-red-800">
                      Errors ({result.errors.length})
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {result.errors.map((e) => (
                        <li
                          key={`${e.line}-${e.message}`}
                          className="text-xs text-red-700"
                        >
                          Line {e.line}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleOpenChange(false)}
              disabled={pending}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={pending}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {pending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {pending ? "Importing..." : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CsvImportDialog;
