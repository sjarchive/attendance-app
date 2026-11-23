"use client";

import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Download, FileUp, Loader2, Upload } from "lucide-react";
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
import { parseRosterCsv } from "@/lib/csv";
import type { ImportSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CsvImportDialogProps {
  courseId: string;
  onImported: () => void;
}

const SAMPLE_CSV = `Roll No,Name
BED-12,Ravi Kumar
BED-13,Priya Nair
BED-14,Ananya Verma
`;

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
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => {
    if (csv.trim().length === 0) return null;
    return parseRosterCsv(csv);
  }, [csv]);

  function resetState() {
    setCsv("");
    setFileName(null);
    setDragging(false);
    setResult(null);
    setPending(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) resetState();
  }

  function readFile(file: File) {
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsv(text);
    };
    reader.onerror = () => {
      toast.error("Could not read the selected file");
    };
    reader.readAsText(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    readFile(file);
    event.target.value = ""; // allow re-selecting the same file later
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  function handleDownloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster-sample.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
      >
        <Upload className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Import CSV
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import students from CSV</DialogTitle>
            <DialogDescription>
              Two columns per line: roll number, name. A header row is optional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Drag-and-drop zone + sample download */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center transition-colors",
                dragging
                  ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30"
                  : "bg-muted/30"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileChange}
              />
              <FileUp
                className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <div className="space-y-0.5">
                <p className="text-xs font-medium">
                  {fileName
                    ? `Loaded: ${fileName}`
                    : "Drop a CSV file here or browse from your device"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Supports .csv and .txt files up to 1,000 rows
                </p>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending}
                >
                  Choose file
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDownloadSample}
                  disabled={pending}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  Download sample CSV
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="csv-content" className="text-xs">
                CSV content
              </Label>
              <Textarea
                id="csv-content"
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setResult(null);
                }}
                placeholder={"BED-12, Ravi Kumar\nBED-13, Priya Nair"}
                rows={5}
                className="font-mono text-xs"
                disabled={pending}
              />
            </div>

            {/* Live client-side parsed preview before submitting */}
            {preview && !result && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium">
                    Preview ·{" "}
                    <span className="tabular-nums text-emerald-700 dark:text-emerald-400">
                      {preview.rows.length} valid{" "}
                      {preview.rows.length === 1 ? "row" : "rows"}
                    </span>
                  </span>
                  {preview.errors.length > 0 && (
                    <span className="font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                      {preview.errors.length}{" "}
                      {preview.errors.length === 1 ? "warning" : "warnings"}
                    </span>
                  )}
                </div>

                {preview.rows.length > 0 && (
                  <div className="overflow-hidden rounded border bg-background">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-2.5 py-1.5 font-medium">Roll No</th>
                          <th className="px-2.5 py-1.5 font-medium">Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {preview.rows.slice(0, 5).map((r) => (
                          <tr key={r.rollNo}>
                            <td className="px-2.5 py-1.5 font-mono tabular-nums">
                              {r.rollNo}
                            </td>
                            <td className="px-2.5 py-1.5">{r.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {preview.rows.length > 5 && (
                      <p className="border-t bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground tabular-nums">
                        +{preview.rows.length - 5} more rows ready to import
                      </p>
                    )}
                  </div>
                )}

                {preview.errors.length > 0 && (
                  <ul className="max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-amber-800 dark:text-amber-300">
                    {preview.errors.slice(0, 4).map((e) => (
                      <li key={`${e.line}-${e.message}`}>
                        Line {e.line}: {e.message}
                      </li>
                    ))}
                    {preview.errors.length > 4 && (
                      <li>+{preview.errors.length - 4} more issues</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {result && (
              <div className="space-y-3 rounded-lg border p-3">
                <p className="text-sm font-medium">
                  Import summary
                  <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
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
                  <div className="max-h-36 overflow-y-auto rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
                    <p className="text-xs font-medium text-red-800 dark:text-red-300">
                      Errors ({result.errors.length})
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {result.errors.map((e) => (
                        <li
                          key={`${e.line}-${e.message}`}
                          className="text-xs text-red-700 dark:text-red-300"
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
              onClick={() => void handleSubmit()}
              disabled={pending || !preview || preview.rows.length === 0}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {pending ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {pending
                ? "Importing..."
                : preview && preview.rows.length > 0
                  ? `Import ${preview.rows.length} ${preview.rows.length === 1 ? "student" : "students"}`
                  : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CsvImportDialog;
