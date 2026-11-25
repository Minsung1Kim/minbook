"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Header } from "@/components/Header";
import { useTimezone } from "@/context/TimezoneContext";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import {
  ChatMarketContextSnapshot,
  ChatThreadSummary,
  MarketStalenessBadge,
  StratUIMessage,
} from "@/types/chat";
import {
  Plus,
  Trash2,
  Send,
  Square,
  ImagePlus,
  X,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PanelLeftOpen,
  PanelLeftClose,
  RotateCcw,
  Maximize2,
  Copy,
  Check,
  Pencil,
  KeyRound,
  ExternalLink,
} from "lucide-react";

interface StagedAttachment {
  localId: string;
  filename: string;
  mediaType: string;
  previewUrl: string;
  signedUrl?: string;
  storagePath?: string;
  uploading: boolean;
  error?: string;
}

const STARTER_PROMPTS = [
  {
    title: "Break down this Strat setup",
    prompt:
      "Break down today's NQ setup using The Strat (1/2/3 candles, 2-1-2 / 3-1-2, FTFC), key levels, and where invalidation sits.",
  },
  {
    title: "Where is invalidation?",
    prompt:
      "Based on today's structure and key levels, where is the exact invalidation level and what confirms a valid NY open trigger?",
  },
  {
    title: "Check FTFC & key levels",
    prompt:
      "Check today's key MinBook levels (VWAP, ONH/ONL, PDC, GEX) with their timestamps and staleness, and map the highest-probability magnets.",
  },
];

function StalenessBadgePill({
  badge,
  stalenessSeconds,
}: {
  badge: MarketStalenessBadge;
  stalenessSeconds?: number;
}) {
  const styles: Record<MarketStalenessBadge, string> = {
    FRESH: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    DELAYED: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    STALE: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    SAMPLE: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  };
  const label =
    badge === "DELAYED"
      ? "15m DELAYED"
      : badge === "STALE"
      ? `STALE (${stalenessSeconds ?? "?"}s)`
      : badge === "SAMPLE"
      ? "SAMPLE"
      : "FRESH";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] uppercase tracking-wider font-medium ${styles[badge]}`}
    >
      {label}
    </span>
  );
}

function getMessageText(message: StratUIMessage): string {
  return (message.parts || [])
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

export function ChatWorkspace() {
  const { timezone, timezoneCode } = useTimezone();

  const [selectedInstrument, setSelectedInstrument] = useState<"NQ" | "MNQ">("NQ");

  // Live Context & On-Site API Key State
  const [contextSnapshot, setContextSnapshot] =
    useState<ChatMarketContextSnapshot | null>(null);
  const [aiConfigured, setAiConfigured] = useState<boolean>(true);
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [keySource, setKeySource] = useState<"USER" | "ENV" | "NONE">("NONE");
  const [showKeyPanel, setShowKeyPanel] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [savingKey, setSavingKey] = useState<boolean>(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState<boolean>(true);
  const [contextError, setContextError] = useState<string | null>(null);

  // Thread Sidebar State
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState<boolean>(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Composer & Attachments State
  const [input, setInput] = useState<string>("");
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const fetchThreads = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/threads", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.success) {
        setThreads(json.threads || []);
      }
    } catch (err) {
      console.error("Failed to fetch chat threads:", err);
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    []
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    error: chatError,
    clearError,
    regenerate,
  } = useChat<StratUIMessage>({
    transport,
    throttle: 50,
    onFinish: () => {
      fetchThreads();
    },
  });

  const isBusy = status === "submitted" || status === "streaming";

  const formatTs = useCallback(
    (isoStr: string | undefined) => {
      if (!isoStr) return "--";
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return isoStr;
      return `${d.toLocaleTimeString("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })} ${timezoneCode}`;
    },
    [timezone, timezoneCode]
  );

  const formatShortDate = useCallback(
    (isoStr: string) => {
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString("en-US", {
        timeZone: timezone,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    },
    [timezone]
  );

  const fetchContext = useCallback(
    async (refresh = false) => {
      setContextLoading(true);
      setContextError(null);
      try {
        const res = await fetch(
          `/api/chat/context?symbol=${selectedInstrument}&refresh=${refresh ? "true" : "false"}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to fetch live context");
        }
        setContextSnapshot(json.snapshot);
        if (typeof json.aiConfigured === "boolean") {
          setAiConfigured(json.aiConfigured);
        }
        if ("keyHint" in json) setKeyHint(json.keyHint ?? null);
        if ("keySource" in json) setKeySource(json.keySource ?? "NONE");
      } catch (err: unknown) {
        setContextError(err instanceof Error ? err.message : "Failed to load market context");
      } finally {
        setContextLoading(false);
      }
    },
    [selectedInstrument]
  );

  const syncUrlThreadParam = useCallback((threadId: string | null) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (threadId) {
      url.searchParams.set("thread", threadId);
    } else {
      url.searchParams.delete("thread");
    }
    window.history.replaceState({}, "", url.toString());
  }, []);

  const loadThread = useCallback(
    async (threadId: string) => {
      try {
        if (isBusy) stop();
        clearError();
        const res = await fetch(`/api/chat/threads/${threadId}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Failed to load thread");
        }

        setActiveThreadId(threadId);
        activeThreadIdRef.current = threadId;
        syncUrlThreadParam(threadId);
        setMessages((json.uiMessages || []) as StratUIMessage[]);
        setMobileSidebarOpen(false);
      } catch (err) {
        console.error("loadThread error:", err);
      }
    },
    [clearError, isBusy, setMessages, stop, syncUrlThreadParam]
  );

  useEffect(() => {
    let cancelled = false;

    async function initContext() {
      try {
        const res = await fetch(
          `/api/chat/context?symbol=${selectedInstrument}&refresh=false`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!cancelled) {
          if (res.ok && json.success) {
            setContextSnapshot(json.snapshot);
            if (typeof json.aiConfigured === "boolean") {
              setAiConfigured(json.aiConfigured);
            }
            if ("keyHint" in json) setKeyHint(json.keyHint ?? null);
            if ("keySource" in json) setKeySource(json.keySource ?? "NONE");
            setContextError(null);
          } else {
            setContextError(json.error || "Failed to load market context");
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setContextError(
            err instanceof Error ? err.message : "Failed to load market context"
          );
        }
      } finally {
        if (!cancelled) {
          setContextLoading(false);
        }
      }
    }

    initContext();
    return () => {
      cancelled = true;
    };
  }, [selectedInstrument]);

  useEffect(() => {
    let cancelled = false;

    async function bootThreadsAndRestore() {
      try {
        const res = await fetch("/api/chat/threads", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && res.ok && json.success) {
          setThreads(json.threads || []);
        }
      } catch (err) {
        console.error("Failed to fetch chat threads:", err);
      } finally {
        if (!cancelled) {
          setThreadsLoading(false);
        }
      }

      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const urlThreadId = params.get("thread");
        if (urlThreadId && !cancelled) {
          try {
            const tRes = await fetch(`/api/chat/threads/${urlThreadId}`, {
              cache: "no-store",
            });
            const tJson = await tRes.json();
            if (!cancelled && tRes.ok && tJson.success) {
              setActiveThreadId(urlThreadId);
              activeThreadIdRef.current = urlThreadId;
              setMessages((tJson.uiMessages || []) as StratUIMessage[]);
            }
          } catch (err) {
            console.error("Failed to restore thread:", err);
          }
        }
      }
    }

    bootThreadsAndRestore();
    return () => {
      cancelled = true;
    };
  }, [setMessages]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchContext(false);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [fetchContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const handleNewChat = useCallback(() => {
    if (isBusy) stop();
    clearError();
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    syncUrlThreadParam(null);
    setMessages([]);
    setAttachments([]);
    setMobileSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }, [clearError, isBusy, setMessages, stop, syncUrlThreadParam]);

  const handleDeleteThread = async (threadId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/chat/threads/${threadId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setThreads((prev) => prev.filter((t) => t.id !== threadId));
        if (activeThreadId === threadId) {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete thread:", err);
    }
  };

  const handleStartRename = (thread: ChatThreadSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingThreadId(thread.id);
    setEditingTitle(thread.title);
  };

  const handleSaveRename = async (threadId: string) => {
    const trimmed = editingTitle.trim();
    setEditingThreadId(null);
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/chat/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setThreads((prev) =>
          prev.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t))
        );
      }
    } catch (err) {
      console.error("Failed to rename thread:", err);
    }
  };

  const uploadImageFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const localId = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);

      setAttachments((prev) => [
        ...prev,
        {
          localId,
          filename: file.name || "chart-screenshot.png",
          mediaType: file.type || "image/png",
          previewUrl,
          uploading: true,
        },
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (activeThreadIdRef.current) {
          formData.append("threadId", activeThreadIdRef.current);
        }

        const res = await fetch("/api/chat/upload", {
          method: "POST",
          body: formData,
        });
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || "Upload failed");
        }

        if (json.threadId && !activeThreadIdRef.current) {
          activeThreadIdRef.current = json.threadId;
          setActiveThreadId(json.threadId);
          syncUrlThreadParam(json.threadId);
          fetchThreads();
        }

        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? {
                  ...a,
                  uploading: false,
                  signedUrl: json.signedUrl,
                  storagePath: json.storagePath,
                  mediaType: json.mediaType || a.mediaType,
                }
              : a
          )
        );
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Upload failed";
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId ? { ...a, uploading: false, error: errMsg } : a
          )
        );
      }
    },
    [fetchThreads, syncUrlThreadParam]
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            uploadImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadImageFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        uploadImageFile(file);
      }
    }
  };

  const removeAttachment = (localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId);
      if (target?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((a) => a.localId !== localId);
    });
  };

  const submitPrompt = async (overrideText?: string) => {
    const textToSend = (overrideText ?? input).trim();
    const readyAttachments = attachments.filter(
      (a) => !a.uploading && !a.error && a.signedUrl
    );
    const stillUploading = attachments.some((a) => a.uploading);

    if (stillUploading || isBusy) return;
    if (!textToSend && readyAttachments.length === 0) return;

    const finalText =
      textToSend || "Break down this NQ/MNQ chart screenshot using The Strat and MinBook levels.";

    let threadId = activeThreadIdRef.current;
    if (!threadId) {
      try {
        const res = await fetch("/api/chat/threads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New NQ Strat Session" }),
        });
        const json = await res.json();
        if (res.ok && json.success && json.thread?.id) {
          threadId = json.thread.id;
          activeThreadIdRef.current = threadId;
          setActiveThreadId(threadId);
          syncUrlThreadParam(threadId);
          fetchThreads();
        }
      } catch (err) {
        console.error("Failed to pre-create thread:", err);
      }
    }

    const files = readyAttachments.map((a) => ({
      type: "file" as const,
      filename: a.filename,
      mediaType: a.mediaType,
      url: a.signedUrl!,
    }));

    const attachmentPaths: Record<string, string> = {};
    for (const a of readyAttachments) {
      if (a.signedUrl && a.storagePath) {
        attachmentPaths[a.signedUrl] = a.storagePath;
      }
    }

    setInput("");
    setAttachments([]);

    await sendMessage(
      {
        text: finalText,
        files: files.length > 0 ? files : undefined,
      },
      {
        body: {
          threadId,
          symbol: selectedInstrument,
          attachmentPaths,
        },
      }
    );
  };

  const handleRegenerate = useCallback(
    (messageId?: string) => {
      regenerate({
        messageId,
        body: {
          threadId: activeThreadIdRef.current,
          symbol: selectedInstrument,
        },
      });
    },
    [regenerate, selectedInstrument]
  );

  const handleCopyMessage = async (msg: StratUIMessage) => {
    const text = getMessageText(msg);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(msg.id);
      setTimeout(() => {
        setCopiedMsgId((curr) => (curr === msg.id ? null : curr));
      }, 1500);
    } catch {}
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = apiKeyInput.trim();
    if (!trimmed || savingKey) return;

    setSavingKey(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/chat/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to save key");
      }
      setAiConfigured(true);
      setKeyHint(json.keyHint ?? null);
      setKeySource(json.keySource ?? "USER");
      setApiKeyInput("");
      setShowKeyPanel(false);
    } catch (err: unknown) {
      setKeyError(err instanceof Error ? err.message : "Failed to save key");
    } finally {
      setSavingKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (savingKey) return;
    setSavingKey(true);
    setKeyError(null);
    try {
      const res = await fetch("/api/chat/key", { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.success) {
        setAiConfigured(Boolean(json.aiConfigured));
        setKeyHint(json.keyHint ?? null);
        setKeySource(json.keySource ?? "NONE");
        setShowKeyPanel(false);
      }
    } catch (err: unknown) {
      setKeyError(err instanceof Error ? err.message : "Failed to remove key");
    } finally {
      setSavingKey(false);
    }
  };

  const quote = contextSnapshot?.quote;
  const regime = contextSnapshot?.regime;
  const lastAssistantMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const shortBiasLabel = useMemo(() => {
    if (!regime) return "";
    if (regime.biasVerdict.includes("BULLISH")) return "BULLISH";
    if (regime.biasVerdict.includes("BEARISH")) return "BEARISH";
    if (regime.biasVerdict.includes("STAND ASIDE")) return "STAND ASIDE";
    return "CHOP / NEUTRAL";
  }, [regime]);

  const renderThreadItem = (t: ChatThreadSummary) => {
    const isActive = t.id === activeThreadId;
    const isEditing = editingThreadId === t.id;

    return (
      <div
        key={t.id}
        onClick={() => !isEditing && loadThread(t.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (!isEditing && (e.key === "Enter" || e.key === " ")) loadThread(t.id);
        }}
        className={`group flex items-center justify-between px-2.5 py-2 rounded-md border text-left cursor-pointer transition-colors ${
          isActive
            ? "bg-zinc-900 border-zinc-700 text-zinc-100"
            : "bg-transparent border-transparent hover:bg-zinc-900/60 hover:border-zinc-800/80 text-zinc-400"
        }`}
      >
        <div className="min-w-0 flex-1 pr-1.5">
          {isEditing ? (
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveRename(t.id);
                if (e.key === "Escape") setEditingThreadId(null);
              }}
              onBlur={() => handleSaveRename(t.id)}
              autoFocus
              className="w-full px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-600 text-xs text-zinc-100 focus:outline-none"
            />
          ) : (
            <>
              <div className="text-xs font-medium truncate">{t.title}</div>
              <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                {formatShortDate(t.updatedAt)}
              </div>
            </>
          )}
        </div>
        {!isEditing && (
          <div className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              type="button"
              onClick={(e) => handleStartRename(t, e)}
              className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
              title="Rename"
              aria-label="Rename session"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => handleDeleteThread(t.id, e)}
              className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
              title="Delete"
              aria-label="Delete session"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <Header
        selectedInstrument={selectedInstrument}
        onSelectInstrument={setSelectedInstrument}
        dataStatus={
          quote?.status === "LIVE"
            ? "LIVE"
            : quote?.status === "SAMPLE"
            ? "SAMPLE"
            : "DELAYED"
        }
        providerName={quote?.source || "Yahoo Finance"}
        lastUpdated={quote?.timestamp}
        isRefreshing={contextLoading}
        onRefresh={() => fetchContext(true)}
      />

      <div className="flex-1 flex max-w-[1640px] w-full mx-auto relative overflow-hidden">
        {/* Left Sidebar */}
        <aside className="hidden lg:flex lg:w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-[#0c0c0e]">
          <div className="p-3 border-b border-zinc-800/80">
            <button
              type="button"
              onClick={handleNewChat}
              className="w-full px-3 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {threadsLoading ? (
              <div className="flex items-center justify-center py-8 text-xs text-zinc-500 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                Loading...
              </div>
            ) : threads.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                No past sessions yet.
              </div>
            ) : (
              threads.map(renderThreadItem)
            )}
          </div>
        </aside>

        {/* Mobile Thread Sidebar Drawer */}
        {mobileSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div
              className="fixed inset-0 bg-black/70"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative z-50 w-72 max-w-[85vw] bg-zinc-950 border-r border-zinc-800 flex flex-col h-full">
              <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-300">
                  Chats
                </span>
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-3 border-b border-zinc-800">
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="w-full px-3 py-2 rounded-md bg-zinc-100 text-zinc-950 text-xs font-semibold flex items-center justify-center space-x-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Chat</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {threads.map(renderThreadItem)}
              </div>
            </div>
          </div>
        )}

        {/* Main Chat Pane */}
        <main
          className="flex-1 flex flex-col min-w-0 h-[calc(100vh-3.5rem)] relative"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setIsDragging(false);
          }}
          onDrop={handleDrop}
        >
          {/* Drag-and-Drop Overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-30 bg-zinc-950/90 border-2 border-dashed border-emerald-500/60 flex flex-col items-center justify-center pointer-events-none">
              <ImagePlus className="w-8 h-8 text-emerald-400 mb-2" />
              <p className="text-sm font-semibold text-zinc-100">
                Drop Chart Screenshot
              </p>
            </div>
          )}

          {/* Minimal Live Context Bar */}
          <div className="border-b border-zinc-800/80 bg-[#111113] px-3 sm:px-5 py-2 shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen((v) => !v)}
                className="lg:hidden p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
                title="Toggle chats"
              >
                {mobileSidebarOpen ? (
                  <PanelLeftClose className="w-3.5 h-3.5" />
                ) : (
                  <PanelLeftOpen className="w-3.5 h-3.5" />
                )}
              </button>

              {contextLoading && !contextSnapshot ? (
                <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Syncing {selectedInstrument}...</span>
                </div>
              ) : contextError && !contextSnapshot ? (
                <span className="text-xs text-rose-400">{contextError}</span>
              ) : quote && regime ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
                    {contextSnapshot.instrument}
                  </span>
                  <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                    {quote.price.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-medium ${
                      shortBiasLabel === "BULLISH"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : shortBiasLabel === "BEARISH"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {shortBiasLabel}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 shrink-0">
              {quote && (
                <>
                  <span className="hidden sm:inline text-zinc-400 truncate max-w-[200px]">
                    {quote.source} · {formatTs(quote.timestamp)}
                  </span>
                  <StalenessBadgePill
                    badge={quote.stalenessBadge}
                    stalenessSeconds={quote.stalenessSeconds}
                  />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setKeyError(null);
                  setShowKeyPanel((v) => !v);
                }}
                className={`px-2 py-1 rounded border text-[11px] font-mono flex items-center space-x-1 transition-colors ${
                  aiConfigured
                    ? "bg-zinc-900 hover:bg-zinc-800 border-zinc-800 text-zinc-400 hover:text-zinc-200"
                    : "bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300"
                }`}
                title="Manage your encrypted Gemini API key"
              >
                <KeyRound className="w-3 h-3" />
                <span className="hidden md:inline">
                  {aiConfigured ? keyHint || "Key Ready" : "Add Key"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => fetchContext(true)}
                disabled={contextLoading}
                className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                title="Refresh market context"
                aria-label="Refresh market context"
              >
                <RefreshCw
                  className={`w-3 h-3 ${contextLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* On-Site Encrypted API Key Setup / Manager */}
          {(!aiConfigured || showKeyPanel) && (
            <div className="mx-3 sm:mx-6 mt-3 rounded-lg border border-zinc-800 bg-[#111113] px-3.5 py-3 text-xs space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-zinc-200">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="font-medium">
                    {aiConfigured
                      ? `Gemini API Key (${keySource === "USER" ? `Saved ${keyHint || ""}` : "Server Env"})`
                      : "Add your free Gemini API key to start chatting"}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <a
                    href="https://aistudio.google.com/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1 px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 font-medium text-[11px] transition-colors"
                  >
                    <span>Get free key here</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {aiConfigured && (
                    <button
                      type="button"
                      onClick={() => setShowKeyPanel(false)}
                      className="p-1 text-zinc-500 hover:text-zinc-200"
                      aria-label="Close key settings"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <form
                onSubmit={handleSaveApiKey}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Paste Gemini API key (AIza...)"
                  className="flex-1 px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingKey || !apiKeyInput.trim()}
                    className="px-3 py-1.5 rounded bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs transition-colors disabled:opacity-40 flex items-center space-x-1.5"
                  >
                    {savingKey && <Loader2 className="w-3 h-3 animate-spin" />}
                    <span>{savingKey ? "Verifying..." : "Save Key"}</span>
                  </button>
                  {keySource === "USER" && (
                    <button
                      type="button"
                      onClick={handleRemoveApiKey}
                      disabled={savingKey}
                      className="px-2.5 py-1.5 rounded bg-zinc-900 hover:bg-rose-500/15 border border-zinc-800 hover:border-rose-500/30 text-zinc-400 hover:text-rose-300 text-xs transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </form>

              {keyError && (
                <div className="text-[11px] text-rose-400 flex items-center space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{keyError}</span>
                </div>
              )}

              <p className="text-[11px] text-zinc-500">
                Encrypted with AES-256-GCM on the server and scoped strictly to your account. Never exposed to the browser.
              </p>
            </div>
          )}

          {/* Message List */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5">
            {messages.length === 0 ? (
              <div className="max-w-xl mx-auto mt-8 sm:mt-14 space-y-5">
                <div>
                  <h1 className="text-base font-semibold text-zinc-100">
                    NQ / MNQ Strat Co-Pilot
                  </h1>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                    Paste (<code className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-300">Cmd+V</code>) or drop a chart screenshot, or ask about today&apos;s setups. Grounded in live MinBook levels, Strat rules, and your journal.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => submitPrompt(item.prompt)}
                      className="text-left px-3.5 py-2.5 rounded-lg border border-zinc-800/80 bg-[#111113] hover:bg-zinc-900 hover:border-zinc-700 transition-colors"
                    >
                      <div className="text-xs font-medium text-zinc-100">
                        {item.title}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((message) => {
                  const isUser = message.role === "user";
                  const isLatestAssistant = message.id === lastAssistantMsgId;

                  return (
                    <div
                      key={message.id}
                      className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`w-full ${
                          isUser ? "max-w-[85%] sm:max-w-[75%]" : "max-w-full"
                        } rounded-lg border px-4 py-3 ${
                          isUser
                            ? "bg-zinc-900/90 border-zinc-700/80 text-zinc-100"
                            : "bg-[#111113] border-zinc-800/80 text-zinc-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                            {isUser ? "You" : "MinBook AI"}
                          </span>

                          {!isUser && (
                            <div className="flex items-center space-x-1">
                              {getMessageText(message) && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(message)}
                                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
                                  title="Copy"
                                  aria-label="Copy response"
                                >
                                  {copiedMsgId === message.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              {isLatestAssistant && !isBusy && (
                                <button
                                  type="button"
                                  onClick={() => handleRegenerate(message.id)}
                                  className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
                                  title="Regenerate"
                                  aria-label="Regenerate response"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="space-y-2.5">
                          {message.parts.map((part, idx) => {
                            if (
                              part.type === "file" &&
                              part.mediaType?.startsWith("image/")
                            ) {
                              return (
                                <div
                                  key={`${message.id}-img-${idx}`}
                                  className="relative group inline-block rounded-md overflow-hidden border border-zinc-800 bg-zinc-950"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={part.url}
                                    alt={part.filename || "Chart screenshot"}
                                    onClick={() => setLightboxUrl(part.url)}
                                    className="max-h-80 w-auto object-contain cursor-zoom-in"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setLightboxUrl(part.url)}
                                    className="absolute top-2 right-2 p-1 rounded bg-zinc-950/80 border border-zinc-700 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Expand"
                                  >
                                    <Maximize2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              );
                            }

                            if (part.type === "text") {
                              return isUser ? (
                                <div
                                  key={`${message.id}-txt-${idx}`}
                                  className="text-[13px] leading-relaxed whitespace-pre-wrap text-zinc-100"
                                >
                                  {part.text}
                                </div>
                              ) : (
                                <MarkdownMessage
                                  key={`${message.id}-md-${idx}`}
                                  content={part.text}
                                />
                              );
                            }

                            return null;
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {isBusy && (
                  <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400 px-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Thinking...</span>
                  </div>
                )}

                {chatError && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 flex items-start justify-between gap-3 text-xs text-rose-300">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <span>{chatError.message || "Could not complete response."}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRegenerate()}
                      className="shrink-0 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 flex items-center space-x-1 font-mono text-[11px]"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Clean Composer */}
          <div className="border-t border-zinc-800/80 bg-[#0c0c0e] px-3 sm:px-6 py-3 shrink-0">
            <div className="max-w-3xl mx-auto">
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2.5">
                  {attachments.map((att) => (
                    <div
                      key={att.localId}
                      className="relative flex items-center space-x-2 p-1.5 pr-7 rounded-md bg-zinc-900 border border-zinc-800"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={att.previewUrl}
                        alt={att.filename}
                        className="w-11 h-11 rounded object-cover border border-zinc-800"
                      />
                      <div className="min-w-0 max-w-[140px]">
                        <div className="text-[11px] text-zinc-200 truncate font-mono">
                          {att.filename}
                        </div>
                        {att.uploading ? (
                          <div className="text-[10px] text-amber-400 font-mono flex items-center space-x-1 mt-0.5">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Uploading...</span>
                          </div>
                        ) : att.error ? (
                          <div className="text-[10px] text-rose-400 font-mono truncate mt-0.5">
                            {att.error}
                          </div>
                        ) : (
                          <div className="text-[10px] text-emerald-400 font-mono flex items-center space-x-1 mt-0.5">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Ready</span>
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.localId)}
                        className="absolute top-1 right-1 p-0.5 rounded bg-zinc-950 text-zinc-400 hover:text-zinc-100"
                        title="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitPrompt();
                }}
                className="flex items-end space-x-2 rounded-lg border border-zinc-800 bg-zinc-950 p-2 focus-within:border-zinc-600 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    for (const file of files) {
                      uploadImageFile(file);
                    }
                    e.target.value = "";
                  }}
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                  className="p-2 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-colors shrink-0 disabled:opacity-50"
                  title="Attach chart screenshot (or paste Cmd+V)"
                  aria-label="Attach chart screenshot"
                >
                  <ImagePlus className="w-4 h-4" />
                </button>

                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitPrompt();
                    }
                  }}
                  placeholder={`Ask about ${selectedInstrument} Strat setups or paste a chart (Cmd+V)...`}
                  className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none resize-none py-1.5 min-h-[36px] max-h-[160px]"
                />

                {isBusy ? (
                  <button
                    type="button"
                    onClick={() => stop()}
                    className="px-3 py-2 rounded-md bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center space-x-1 shrink-0"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop</span>
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={
                      attachments.some((a) => a.uploading) ||
                      (!input.trim() &&
                        !attachments.some((a) => !a.uploading && !a.error && a.signedUrl))
                    }
                    className="px-3 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center space-x-1.5 shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                )}
              </form>
            </div>
          </div>
        </main>
      </div>

      {/* Fullscreen Chart Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 p-2 rounded-md bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Chart preview"
            className="max-w-full max-h-[90vh] object-contain rounded border border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
