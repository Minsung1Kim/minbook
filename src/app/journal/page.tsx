"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/Header";
import { TradeLogEntry, JournalAnalytics } from "@/types/app";
import { DailyPrediction, PredictionGrade } from "@/types/calibration";
import {
  extractPnlFromScreenshot,
  OverlayDetectionResult,
} from "@/lib/journal/pnlOverlayReader";
import {
  Trash2,
  ImageIcon,
  X,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function JournalPage() {
  const [symbol, setSymbol] = useState<"NQ" | "MNQ">("NQ");
  const [trades, setTrades] = useState<TradeLogEntry[]>([]);
  const [analytics, setAnalytics] = useState<JournalAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Screenshot & Auto-Read State
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [scanningOcr, setScanningOcr] = useState(false);
  const [ocrResult, setOcrResult] = useState<OverlayDetectionResult | null>(null);
  const [pnlInput, setPnlInput] = useState<string>("");
  const [tradeDate, setTradeDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Selected row for right-side drawer
  const [selectedTrade, setSelectedTrade] = useState<TradeLogEntry | null>(null);
  const [auditMap, setAuditMap] = useState<
    Record<string, { prediction: DailyPrediction; grade: PredictionGrade | null }>
  >({});

  const processScreenshot = useCallback(async (dataUrl: string) => {
    setScreenshotData(dataUrl);
    setErrorMsg(null);
    setScanningOcr(true);
    setOcrResult(null);

    try {
      const detected = await extractPnlFromScreenshot(dataUrl);
      setOcrResult(detected);
      if (detected.pnlDollars !== null) {
        setPnlInput(detected.pnlDollars.toFixed(2));
      } else {
        setPnlInput("");
      }
    } catch (err) {
      console.error("Screenshot overlay OCR error:", err);
      setOcrResult({
        pnlDollars: null,
        overlayColor: "UNKNOWN",
        rawText: "",
        confidence: "LOW",
        method: "MANUAL",
      });
    } finally {
      setScanningOcr(false);
    }
  }, []);

  const readFileAsDataUrl = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (typeof event.target?.result === "string") {
          processScreenshot(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    },
    [processScreenshot]
  );

  // Handle Cmd+V paste anywhere on page
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            readFileAsDataUrl(file);
            break;
          }
        }
      }
    },
    [readFileAsDataUrl]
  );

  useEffect(() => {
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handlePaste]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      readFileAsDataUrl(files[0]);
    }
  };

  const fetchJournal = async () => {
    try {
      const res = await fetch("/api/journal");
      const json = await res.json();
      if (json.success) {
        setTrades(json.trades || []);
        setAnalytics(json.analytics || null);
      }

      const auditRes = await fetch("/api/calibration/audit");
      const auditJson = await auditRes.json();
      if (auditJson.success && auditJson.data?.history) {
        const map: Record<string, { prediction: DailyPrediction; grade: PredictionGrade | null }> = {};
        for (const item of auditJson.data.history) {
          map[item.prediction.targetTradeDate] = item;
        }
        setAuditMap(map);
      }
    } catch (err) {
      console.error("fetchJournal error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJournal();
  }, []);

  const handleSaveScreenshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!screenshotData) return;

    const parsedPnl = parseFloat(pnlInput);
    if (isNaN(parsedPnl)) {
      setErrorMsg("Enter or confirm the P&L dollar amount from your screenshot.");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const overlayColor =
      ocrResult?.overlayColor && ocrResult.overlayColor !== "UNKNOWN"
        ? ocrResult.overlayColor
        : parsedPnl >= 0
        ? "GREEN"
        : "RED";

    const auditForDay = auditMap[tradeDate];

    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeDate,
          symbol,
          actualPnlDollars: parsedPnl,
          overlayColor,
          rawOcrText: ocrResult?.rawText || "",
          ocrConfidence: ocrResult?.confidence || "MEDIUM",
          notes,
          screenshotData,
          biasVerdictSnapshot: auditForDay?.prediction?.biasVerdict || "",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save screenshot");
      }

      setScreenshotData(null);
      setOcrResult(null);
      setPnlInput("");
      setNotes("");
      await fetchJournal();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to save screenshot");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTrade = async (id: string) => {
    if (!confirm("Delete this screenshot entry?")) return;
    try {
      const res = await fetch(`/api/journal?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (json.success) {
        if (selectedTrade?.id === id) {
          setSelectedTrade(null);
        }
        fetchJournal();
      }
    } catch (err) {
      console.error("handleDeleteTrade error:", err);
    }
  };

  const totalNetPnl = analytics?.totalPnlDollars ?? 0;
  const winRate = analytics?.winRatePercent ?? 0;
  const wins = analytics?.wins ?? 0;
  const losses = analytics?.losses ?? 0;
  const avgWin = analytics?.avgWinDollars ?? 0;
  const avgLoss = analytics?.avgLossDollars ?? 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans">
      <Header selectedInstrument={symbol} onSelectInstrument={(inst) => setSymbol(inst)} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 space-y-3.5">
        {/* 1. COMPACT SUMMARY BAR */}
        <div className="px-4 py-3 rounded-lg bg-zinc-900/70 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <span className="text-zinc-500 uppercase text-[10px] block">Net P&amp;L</span>
              <span
                className={`text-sm font-bold tabular-nums ${
                  totalNetPnl >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {totalNetPnl >= 0 ? "+" : "-"}${Math.abs(totalNetPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Win Rate</span>
              <span className="text-sm font-bold tabular-nums text-zinc-100">
                {winRate.toFixed(1)}%
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Green / Red</span>
              <span className="text-sm font-bold tabular-nums text-zinc-100">
                <span className="text-emerald-400">{wins}</span> /{" "}
                <span className="text-rose-400">{losses}</span>
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Avg Win / Loss</span>
              <span className="text-sm font-bold tabular-nums">
                <span className="text-emerald-400">+${avgWin.toFixed(0)}</span>
                <span className="text-zinc-600"> / </span>
                <span className="text-rose-400">-${avgLoss.toFixed(0)}</span>
              </span>
            </div>

            <div className="border-l border-zinc-800/80 pl-4">
              <span className="text-zinc-500 uppercase text-[10px] block">Screenshots</span>
              <span className="text-sm font-bold tabular-nums text-zinc-100">
                {trades.length}
              </span>
            </div>
          </div>

          <span className="text-[11px] font-sans text-zinc-400">
            Screenshot-only P&amp;L tracker (reads green/red P&amp;L overlay)
          </span>
        </div>

        {/* 2. SCREENSHOT DROP / CMD+V PASTE / UPLOAD AREA */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-lg bg-zinc-900/60 border border-dashed border-zinc-700/80 hover:border-zinc-500 p-4 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) readFileAsDataUrl(file);
              e.target.value = "";
            }}
          />

          {!screenshotData ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="py-5 flex flex-col items-center justify-center text-center cursor-pointer space-y-2"
            >
              <div className="p-2.5 rounded-full bg-zinc-950 border border-zinc-800 text-zinc-300">
                <Upload className="w-4 h-4" />
              </div>
              <div className="text-xs font-medium text-zinc-200">
                Drop your trade screenshot, click to browse, or press{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 font-mono text-[11px] text-zinc-300">
                  Cmd+V
                </kbd>
              </div>
              <p className="text-[11px] text-zinc-500 max-w-md">
                Automatically detects the green or red P&amp;L overlay on your chart/platform screenshot and reads the dollar P&amp;L.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSaveScreenshot} className="space-y-3.5">
              <div className="flex flex-col md:flex-row gap-4 items-start">
                {/* Screenshot Thumbnail */}
                <div className="relative w-full md:w-64 shrink-0 rounded-lg overflow-hidden border border-zinc-800 bg-black">
                  <img
                    src={screenshotData}
                    alt="Trade screenshot preview"
                    className="w-full h-36 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setScreenshotData(null);
                      setOcrResult(null);
                      setPnlInput("");
                      setErrorMsg(null);
                    }}
                    className="absolute top-1.5 right-1.5 p-1 rounded bg-zinc-950/90 border border-zinc-700 text-zinc-300 hover:text-white"
                    title="Remove screenshot"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Auto-Detected Overlay & Save Controls */}
                <div className="flex-1 w-full space-y-3">
                  {/* Detection Status Banner */}
                  {scanningOcr ? (
                    <div className="px-3 py-2 rounded bg-zinc-950 border border-zinc-800 flex items-center space-x-2 text-xs font-mono text-zinc-300">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>Scanning green/red P&amp;L overlay...</span>
                    </div>
                  ) : ocrResult ? (
                    <div className="px-3 py-2 rounded bg-zinc-950 border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <div className="flex items-center space-x-2">
                        {ocrResult.pnlDollars !== null ? (
                          <CheckCircle2
                            className={`w-3.5 h-3.5 ${
                              ocrResult.overlayColor === "RED" ? "text-rose-400" : "text-emerald-400"
                            }`}
                          />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                            ocrResult.overlayColor === "GREEN"
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : ocrResult.overlayColor === "RED"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : "bg-zinc-800 text-zinc-300 border-zinc-700"
                          }`}
                        >
                          {ocrResult.overlayColor === "GREEN"
                            ? "GREEN P&L OVERLAY"
                            : ocrResult.overlayColor === "RED"
                            ? "RED P&L OVERLAY"
                            : "OVERLAY NOT CLEAR"}
                        </span>
                        <span className="text-zinc-300">
                          {ocrResult.pnlDollars !== null
                            ? `Read: ${ocrResult.rawText || `$${ocrResult.pnlDollars}`}`
                            : "Could not read digits automatically — enter P&L below."}
                        </span>
                      </div>

                      {ocrResult.overlayCropDataUrl && (
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] text-zinc-500">Detected crop:</span>
                          <img
                            src={ocrResult.overlayCropDataUrl}
                            alt="Detected P&L overlay crop"
                            className="h-6 max-w-[120px] object-contain rounded border border-zinc-700"
                          />
                        </div>
                      )}
                    </div>
                  ) : null}

                  {errorMsg && (
                    <div className="px-3 py-2 rounded bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
                      {errorMsg}
                    </div>
                  )}

                  {/* Simple 3-Field Confirmation Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                    <div>
                      <label className="text-zinc-400 text-[11px] block mb-1">
                        P&amp;L ($) from Overlay
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={pnlInput}
                        onChange={(e) => setPnlInput(e.target.value)}
                        placeholder="e.g. 420.00 or -250.00"
                        className={`w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 tabular-nums font-bold ${
                          parseFloat(pnlInput) < 0
                            ? "text-rose-400"
                            : parseFloat(pnlInput) > 0
                            ? "text-emerald-400"
                            : "text-zinc-100"
                        }`}
                        required
                      />
                    </div>

                    <div>
                      <label className="text-zinc-400 text-[11px] block mb-1">Date</label>
                      <input
                        type="date"
                        value={tradeDate}
                        onChange={(e) => setTradeDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-zinc-400 text-[11px] block mb-1">
                        Quick Note (Optional)
                      </label>
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Bounced off VWAP"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-200 font-sans"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button
                      type="submit"
                      disabled={submitting || scanningOcr}
                      className="px-4 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-900 font-semibold text-xs transition-colors disabled:opacity-50"
                    >
                      {submitting ? "Saving..." : "Save Screenshot"}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* 3. SCREENSHOT P&L LEDGER TABLE */}
        <div className="rounded-lg bg-zinc-900/70 border border-zinc-800/80 overflow-hidden font-mono">
          <div className="px-4 py-2.5 border-b border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400 uppercase tracking-wider text-[11px]">
              Screenshot P&amp;L Ledger ({trades.length} Sessions)
            </span>
            <span className="text-zinc-500 text-[11px] font-sans">
              Click any row to view screenshot
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-950/80 text-zinc-500 text-[10px] uppercase tracking-wider border-b border-zinc-800/80">
                <tr>
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-3">Overlay</th>
                  <th className="py-2.5 px-3 text-right">P&amp;L ($)</th>
                  <th className="py-2.5 px-3">Note</th>
                  <th className="py-2.5 px-4">Model Call That Day</th>
                  <th className="py-2.5 px-3 text-center w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 tabular-nums">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500 font-mono text-xs">
                      Loading screenshot ledger...
                    </td>
                  </tr>
                ) : trades.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-zinc-500 font-sans text-xs">
                      No screenshots saved yet. Drop or paste (<kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[10px]">Cmd+V</kbd>) your first screenshot above.
                    </td>
                  </tr>
                ) : (
                  trades.map((t) => {
                    const audit = auditMap[t.tradeDate];
                    const isWin = t.actualPnlDollars >= 0;
                    const overlayTag = t.overlayColor || (isWin ? "GREEN" : "RED");

                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTrade(t)}
                        className="hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 text-zinc-200 font-medium">
                          {t.tradeDate}
                        </td>

                        <td className="py-3 px-3">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                              overlayTag === "GREEN"
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            }`}
                          >
                            {overlayTag}
                          </span>
                        </td>

                        <td
                          className={`py-3 px-3 text-right font-bold ${
                            isWin ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isWin ? "+" : "-"}${Math.abs(t.actualPnlDollars).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        <td className="py-3 px-3 text-zinc-400 font-sans text-xs max-w-xs truncate">
                          {t.notes || t.rawOcrText || "—"}
                        </td>

                        <td className="py-3 px-4">
                          {audit?.prediction ? (
                            <span className="text-[11px] text-zinc-300">
                              {audit.prediction.biasVerdict}
                              {audit.grade && (
                                <span
                                  className={`ml-2 px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                                    audit.grade.biasCorrect
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                  }`}
                                >
                                  {audit.grade.biasCorrect ? "HIT" : "MISS"}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-zinc-600 text-[11px]">No call recorded</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTrade(t);
                            }}
                            className="p-1 rounded text-zinc-500 hover:text-zinc-200 opacity-60 group-hover:opacity-100 transition-opacity"
                            title="View screenshot"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 4. RIGHT-SIDE SCREENSHOT VIEWER SHEET */}
        <Sheet open={!!selectedTrade} onOpenChange={(open) => !open && setSelectedTrade(null)}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-xl bg-zinc-950 border-l border-zinc-800 p-0 overflow-y-auto"
          >
            {selectedTrade && (
              <div className="p-5 space-y-4 font-mono text-xs">
                <SheetHeader className="p-0 border-b border-zinc-800/80 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <SheetTitle className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                        <span>{selectedTrade.tradeDate}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            selectedTrade.actualPnlDollars >= 0
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          }`}
                        >
                          {selectedTrade.overlayColor || (selectedTrade.actualPnlDollars >= 0 ? "GREEN" : "RED")} OVERLAY
                        </span>
                      </SheetTitle>
                      <SheetDescription className="text-zinc-500 text-[11px] mt-0.5">
                        {selectedTrade.rawOcrText
                          ? `Detected overlay text: ${selectedTrade.rawOcrText}`
                          : "Saved trade screenshot"}
                      </SheetDescription>
                    </div>

                    <div className="text-right tabular-nums pr-6">
                      <div
                        className={`text-base font-bold ${
                          selectedTrade.actualPnlDollars >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {selectedTrade.actualPnlDollars >= 0 ? "+" : "-"}$
                        {Math.abs(selectedTrade.actualPnlDollars).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>
                </SheetHeader>

                {(selectedTrade.screenshotSignedUrl || selectedTrade.screenshotDataUrl) ? (
                  <div className="space-y-1.5">
                    <span className="font-semibold text-zinc-400 uppercase text-[10px] tracking-wider block">
                      Trade Screenshot
                    </span>
                    <div className="rounded-lg border border-zinc-800/80 overflow-hidden bg-black p-1">
                      <img
                        src={selectedTrade.screenshotSignedUrl || selectedTrade.screenshotDataUrl}
                        alt="Saved trade screenshot"
                        className="w-full max-h-[460px] object-contain rounded"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded bg-zinc-900/50 border border-zinc-800 text-zinc-500 flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4" />
                    <span>No screenshot preview available for this entry.</span>
                  </div>
                )}

                {selectedTrade.notes && (
                  <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800 text-zinc-300 font-sans text-xs">
                    {selectedTrade.notes}
                  </div>
                )}

                {auditMap[selectedTrade.tradeDate]?.prediction && (
                  <div className="p-3 rounded bg-zinc-900/60 border border-zinc-800 space-y-1 text-xs font-sans">
                    <span className="font-mono text-[10px] uppercase text-zinc-500 block">
                      Frozen Model Call ({selectedTrade.tradeDate})
                    </span>
                    <div className="text-zinc-200 font-medium">
                      {auditMap[selectedTrade.tradeDate].prediction.biasVerdict}
                    </div>
                    {auditMap[selectedTrade.tradeDate].grade && (
                      <div className="text-[11px] text-zinc-400 font-mono">
                        09:30–10:00 Open: {auditMap[selectedTrade.tradeDate].grade!.openPrice930.toFixed(1)} • Range:{" "}
                        {auditMap[selectedTrade.tradeDate].grade!.windowLow.toFixed(1)}–
                        {auditMap[selectedTrade.tradeDate].grade!.windowHigh.toFixed(1)} • Result:{" "}
                        {auditMap[selectedTrade.tradeDate].grade!.biasCorrect ? "CORRECT" : "MISSED"}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-800/80 flex justify-end font-sans">
                  <button
                    onClick={() => handleDeleteTrade(selectedTrade.id)}
                    className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-800 hover:border-rose-900/60 text-xs transition-colors flex items-center space-x-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Screenshot</span>
                  </button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}

export default JournalPage;
