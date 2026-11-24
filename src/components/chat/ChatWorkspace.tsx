"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Header } from "@/components/Header";
import { useTimezone } from "@/context/TimezoneContext";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import {
  CHAT_MODEL_OPTIONS,
  ChatMarketContextSnapshot,
  ChatMessageRecord,
  ChatThreadSummary,
  DEFAULT_CHAT_MODEL,
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
  Clock,
  Database,
  Loader2,
  PanelLeftOpen,
  PanelLeftClose,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Sparkles,
  Copy,
  Check,
  Pencil,
  Search,
  Layers,
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

const QUICK_PROMPTS = [
  "Break down this Strat setup",
  "Where is invalidation?",
  "Check FTFC & key levels",
  "Compare to my recent journal trades",
];

const FOLLOW_UP_CHIPS = [
  "Tighten invalidation",
  "Map 5m / 1m trigger",
  "Check Layer 1 risk & sizing",
  "Compare to my journal",
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
      ? "15m DELAYED (CME)"
      : badge === "STALE"
      ? `STALE (${stalenessSeconds ?? "?"}s)`
      : badge === "SAMPLE"
      ? "SAMPLE FALLBACK"
      : "FRESH";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] uppercase tracking-wider font-semibold ${styles[badge]}`}
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
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_CHAT_MODEL);

  // Market Context Bar State
  const [contextSnapshot, setContextSnapshot] =
    useState<ChatMarketContextSnapshot | null>(null);
  const [contextLoading, setContextLoading] = useState<boolean>(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [showLevelsDrawer, setShowLevelsDrawer] = useState<boolean>(false);

  // Thread History State
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState<boolean>(true);
  const [threadFilter, setThreadFilter] = useState<string>("");
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>("");
  const [messageSnapshots, setMessageSnapshots] = useState<
    Record<string, ChatMarketContextSnapshot>
  >({});
  const [expandedSnapIds, setExpandedSnapIds] = useState<Record<string, boolean>>({});
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState<boolean>(false);

  // Input & Attachments State
  const [input, setInput] = useState<string>("");
  const [attachments, setAttachments] = useState<StagedAttachment[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Ref synced in effect for async callbacks
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
        second: "2-digit",
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

        const loadedUiMessages = (json.uiMessages || []) as StratUIMessage[];
        setMessages(loadedUiMessages);

        const snapMap: Record<string, ChatMarketContextSnapshot> = {};
        for (const m of (json.messages || []) as ChatMessageRecord[]) {
          if (m.marketContextSnapshot) {
            snapMap[m.id] = m.marketContextSnapshot;
          }
        }
        setMessageSnapshots(snapMap);
        setExpandedSnapIds({});
        setMobileSidebarOpen(false);
      } catch (err) {
        console.error("loadThread error:", err);
      }
    },
    [clearError, isBusy, setMessages, stop, syncUrlThreadParam]
  );

  // Initial load & instrument switch: fetch context cleanly inside effect
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

  // Initial load: fetch threads and restore ?thread= across page refresh
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
              const snapMap: Record<string, ChatMarketContextSnapshot> = {};
              for (const m of (tJson.messages || []) as ChatMessageRecord[]) {
                if (m.marketContextSnapshot) {
                  snapMap[m.id] = m.marketContextSnapshot;
                }
              }
              setMessageSnapshots(snapMap);
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

  // Periodic context refresh every 60s when tab is visible
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchContext(false);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [fetchContext]);

  // Auto-scroll to bottom when messages stream
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Auto-resize composer textarea
  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleNewChat = useCallback(() => {
    if (isBusy) stop();
    clearError();
    setActiveThreadId(null);
    activeThreadIdRef.current = null;
    syncUrlThreadParam(null);
    setMessages([]);
    setMessageSnapshots({});
    setExpandedSnapIds({});
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

  // Upload image file to Supabase Storage (chart-screenshots)
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

  // Global Cmd+V / Ctrl+V paste handler for chart screenshots
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
          model: selectedModel,
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
          model: selectedModel,
        },
      });
    },
    [regenerate, selectedInstrument, selectedModel]
  );

  const handleInsertLevelToken = (shortName: string, price: number) => {
    const token = `${shortName} (${price.toFixed(2)})`;
    setInput((prev) => (prev ? `${prev.trimEnd()} ${token} ` : `Check ${token} `));
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

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

  const quickLevels = useMemo(() => {
    if (!contextSnapshot) return [];
    const priority = ["VWAP", "ONH", "ONL", "PDC", "PDH", "PDL", "GEX Flip"];
    const found = priority
      .map((tag) =>
        contextSnapshot.keyLevels.find(
          (l) =>
            l.shortName.toLowerCase() === tag.toLowerCase() ||
            l.shortName.toLowerCase().includes(tag.toLowerCase())
        )
      )
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    return found.slice(0, 6);
  }, [contextSnapshot]);

  const filteredThreads = useMemo(() => {
    const q = threadFilter.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, threadFilter]);

  const quote = contextSnapshot?.quote;
  const regime = contextSnapshot?.regime;
  const lastAssistantMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

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
              title="Rename session"
              aria-label="Rename session"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => handleDeleteThread(t.id, e)}
              className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
              title="Delete session"
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
        {/* Left Sidebar: Thread History (Desktop) */}
        <aside className="hidden lg:flex lg:w-72 shrink-0 flex-col border-r border-zinc-800/80 bg-[#0c0c0e]">
          <div className="p-3 border-b border-zinc-800/80 space-y-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="w-full px-3 py-2 rounded-md bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Chat</span>
            </button>

            {threads.length > 3 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={threadFilter}
                  onChange={(e) => setThreadFilter(e.target.value)}
                  placeholder="Filter sessions..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                />
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-zinc-500">
            <span>Strat Sessions</span>
            <span>{filteredThreads.length}</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {threadsLoading ? (
              <div className="flex items-center justify-center py-8 text-xs text-zinc-500 font-mono">
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                Loading...
              </div>
            ) : filteredThreads.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-zinc-500">
                {threadFilter
                  ? "No sessions match your search."
                  : "No saved sessions yet. Upload a chart or ask about today's NQ levels."}
              </div>
            ) : (
              filteredThreads.map(renderThreadItem)
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
                  Chat Sessions
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
                {filteredThreads.map(renderThreadItem)}
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
                Drop NQ / MNQ Chart Screenshot
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                Uploads privately to Supabase Storage for Strat vision breakdown
              </p>
            </div>
          )}

          {/* Top Live Context Bar */}
          <div className="border-b border-zinc-800/80 bg-[#111113] px-3 sm:px-5 py-2.5 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center flex-wrap gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen((v) => !v)}
                  className="lg:hidden p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
                  title="Toggle chat history"
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
                    <span>Loading {selectedInstrument} live context...</span>
                  </div>
                ) : contextError && !contextSnapshot ? (
                  <div className="flex items-center space-x-2 text-xs text-rose-400">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{contextError}</span>
                  </div>
                ) : quote && regime ? (
                  <>
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold">
                        {contextSnapshot.instrument}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-zinc-100">
                        {quote.price.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span
                        className={`font-mono text-xs tabular-nums ${
                          quote.change >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {quote.change >= 0 ? "+" : ""}
                        {quote.change.toFixed(2)} ({quote.changePercent >= 0 ? "+" : ""}
                        {quote.changePercent.toFixed(2)}%)
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded border text-[11px] font-mono font-medium ${
                        regime.biasVerdict.includes("BULLISH")
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : regime.biasVerdict.includes("BEARISH")
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {regime.biasVerdict} · {regime.riskMultiplier.toFixed(1)}x
                    </span>

                    <StalenessBadgePill
                      badge={quote.stalenessBadge}
                      stalenessSeconds={quote.stalenessSeconds}
                    />
                  </>
                ) : null}
              </div>

              {/* Right: Source, Timestamp, Model Selector, Refresh */}
              <div className="flex items-center flex-wrap gap-2 text-[11px] font-mono text-zinc-400">
                {quote && (
                  <div className="hidden md:flex items-center space-x-2 px-2 py-1 rounded bg-zinc-950 border border-zinc-800/80">
                    <Database className="w-3 h-3 text-zinc-500" />
                    <span className="text-zinc-300">{quote.source}</span>
                    <span className="text-zinc-600">|</span>
                    <Clock className="w-3 h-3 text-zinc-500" />
                    <span className="tabular-nums text-zinc-300">
                      {formatTs(quote.timestamp)}
                    </span>
                  </div>
                )}

                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isBusy}
                  aria-label="Vision model"
                  className="px-2 py-1 rounded bg-zinc-950 border border-zinc-800 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-zinc-600"
                >
                  {CHAT_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.provider})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setShowLevelsDrawer((v) => !v)}
                  className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-300 flex items-center space-x-1 transition-colors"
                >
                  <span>Levels</span>
                  {showLevelsDrawer ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => fetchContext(true)}
                  disabled={contextLoading}
                  className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
                  title="Refresh live market context"
                >
                  <RefreshCw
                    className={`w-3 h-3 ${contextLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>

            {/* Clickable Key Levels Strip (click to insert into prompt) */}
            {quickLevels.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {quickLevels.map((lvl) => (
                  <button
                    key={lvl.shortName}
                    type="button"
                    onClick={() => handleInsertLevelToken(lvl.shortName, lvl.price)}
                    className="shrink-0 flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-[11px] font-mono tabular-nums transition-colors"
                    title={`Click to insert ${lvl.shortName} into chat | Source: ${lvl.source} | Updated: ${formatTs(lvl.timestamp)} | Status: ${lvl.staleness}`}
                  >
                    <span className="text-zinc-400">{lvl.shortName}</span>
                    <span className="text-zinc-100 font-medium">
                      {lvl.price.toFixed(2)}
                    </span>
                    <span
                      className={
                        lvl.distancePoints >= 0 ? "text-emerald-400" : "text-rose-400"
                      }
                    >
                      {lvl.distancePoints >= 0 ? "+" : ""}
                      {lvl.distancePoints.toFixed(1)}
                    </span>
                  </button>
                ))}
                {contextSnapshot && (
                  <div className="shrink-0 text-[10px] font-mono text-zinc-500 pl-1">
                    Journal: {contextSnapshot.journal.totalTrades} trades (
                    {contextSnapshot.journal.winRatePercent.toFixed(0)}% WR)
                  </div>
                )}
              </div>
            )}

            {/* Expandable Full Levels & Honesty Provenance Drawer */}
            {showLevelsDrawer && contextSnapshot && (
              <div className="mt-2.5 pt-2.5 border-t border-zinc-800/80 max-h-56 overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-[11px] font-mono">
                  <span className="text-zinc-400">{contextSnapshot.honestyNotice}</span>
                  <span className="text-zinc-500">
                    Snapshot: {formatTs(contextSnapshot.capturedAt)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
                  {contextSnapshot.keyLevels.map((lvl) => (
                    <button
                      key={`${lvl.shortName}-${lvl.price}`}
                      type="button"
                      onClick={() => handleInsertLevelToken(lvl.shortName, lvl.price)}
                      className="text-left flex items-center justify-between px-2.5 py-1.5 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700 text-[11px] font-mono tabular-nums transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-zinc-200 font-medium truncate">
                          {lvl.shortName} · {lvl.price.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {lvl.source} · {formatTs(lvl.timestamp)}
                        </div>
                      </div>
                      <StalenessBadgePill badge={lvl.staleness} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Streaming Message List */}
          <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-5 space-y-4">
            {messages.length === 0 ? (
              <div className="max-w-2xl mx-auto mt-6 sm:mt-10 rounded-lg border border-zinc-800/80 bg-[#111113] p-5 sm:p-6">
                <div className="flex items-center space-x-2 text-xs font-mono uppercase tracking-wider text-zinc-400 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>NQ / MNQ Strat &amp; Quant Co-Pilot</span>
                </div>
                <h1 className="text-base font-semibold text-zinc-100">
                  Multi-Modal Chart Breakdown &amp; Live Regime Grounding
                </h1>
                <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                  Paste (<code className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-200">Cmd+V</code>), drag-and-drop, or upload an NQ/MNQ chart screenshot. Every response is grounded in MinBook&apos;s live levels, GEX/VRP gates, Rob Smith&apos;s Strat rules (1/2/3, 2-1-2, 3-1-2, FTFC), and your personal trade journal.
                </p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    {
                      title: "Strat Candle Breakdown",
                      prompt:
                        "Analyze today's live NQ regime, key levels, and what Strat triggers (2-1-2 / 3-1-2) to watch during the NY open window.",
                    },
                    {
                      title: "FTFC & Key Level Map",
                      prompt:
                        "Check my active key levels (VWAP, ONH/ONL, PDC, GEX Flip) with exact sources and timestamps, and map where liquidity magnets sit.",
                    },
                    {
                      title: "Journal Risk Audit",
                      prompt:
                        "Review my recent trade journal history and tell me what risk rules or recurring mistakes I need to guard against today.",
                    },
                    {
                      title: "Invalidation & Stop Sizing",
                      prompt:
                        "Given today's VRP, VXN, and ATR_Open_15m, what invalidation structure and Layer 1 size multiplier apply right now?",
                    },
                  ].map((card) => (
                    <button
                      key={card.title}
                      type="button"
                      onClick={() => submitPrompt(card.prompt)}
                      className="text-left p-3 rounded-md border border-zinc-800/80 bg-zinc-950/80 hover:bg-zinc-900 hover:border-zinc-700 transition-colors"
                    >
                      <div className="text-xs font-medium text-zinc-100">
                        {card.title}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1 line-clamp-2">
                        {card.prompt}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto space-y-4">
                {messages.map((message) => {
                  const isUser = message.role === "user";
                  const msgSnapshot =
                    message.metadata?.snapshot ?? messageSnapshots[message.id];
                  const isSnapExpanded = Boolean(expandedSnapIds[message.id]);
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
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <div className="flex items-center space-x-2">
                            <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-zinc-400">
                              {isUser ? "Trader" : "MinBook Strat AI"}
                            </span>
                            {!isUser && message.metadata?.model && (
                              <span className="text-[10px] font-mono text-zinc-500">
                                · {message.metadata.model}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center flex-wrap gap-1.5">
                            {!isUser && msgSnapshot && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSnapIds((prev) => ({
                                    ...prev,
                                    [message.id]: !prev[message.id],
                                  }))
                                }
                                className="flex items-center space-x-1.5 px-1.5 py-0.5 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 transition-colors"
                                title="Inspect grounded market snapshot"
                              >
                                <Layers className="w-3 h-3 text-zinc-500" />
                                <span className="tabular-nums text-zinc-300">
                                  {msgSnapshot.instrument}{" "}
                                  {msgSnapshot.quote.price.toFixed(2)}
                                </span>
                                <span className="hidden sm:inline text-zinc-600">·</span>
                                <span className="hidden sm:inline">
                                  {msgSnapshot.quote.source}
                                </span>
                                <StalenessBadgePill
                                  badge={msgSnapshot.quote.stalenessBadge}
                                />
                              </button>
                            )}

                            {!isUser && getMessageText(message) && (
                              <button
                                type="button"
                                onClick={() => handleCopyMessage(message)}
                                className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200 transition-colors"
                                title="Copy response"
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
                                title="Regenerate response"
                                aria-label="Regenerate response"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expandable Turn Context Snapshot */}
                        {!isUser && msgSnapshot && isSnapExpanded && (
                          <div className="mb-3 p-2.5 rounded bg-zinc-950 border border-zinc-800/80 text-[11px] font-mono space-y-1.5">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-zinc-400">
                              <span>
                                Regime: <strong className="text-zinc-200">{msgSnapshot.regime.biasVerdict}</strong> ({msgSnapshot.regime.riskMultiplier.toFixed(1)}x)
                              </span>
                              <span>Captured: {formatTs(msgSnapshot.capturedAt)}</span>
                            </div>
                            <div className="flex flex-wrap gap-3 text-zinc-400">
                              <span>VXN: {msgSnapshot.volatilityAndMacro.vxn.toFixed(2)}</span>
                              <span>VRP: {msgSnapshot.volatilityAndMacro.vrpRatio.toFixed(2)}</span>
                              <span>
                                GEX:{" "}
                                {msgSnapshot.gex.available
                                  ? `${msgSnapshot.gex.netGammaRegime} (Flip ${msgSnapshot.gex.gammaFlipNq})`
                                  : "Unavailable"}
                              </span>
                              <span>SMT: {msgSnapshot.smt.direction}</span>
                            </div>
                          </div>
                        )}

                        {/* Message Parts: Files (Screenshots) + Text */}
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
                                    alt={part.filename || "Uploaded NQ/MNQ chart"}
                                    onClick={() => setLightboxUrl(part.url)}
                                    className="max-h-80 w-auto object-contain cursor-zoom-in"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setLightboxUrl(part.url)}
                                    className="absolute top-2 right-2 p-1 rounded bg-zinc-950/80 border border-zinc-700 text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Inspect full size"
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

                        {/* Contextual Follow-up Chips under latest assistant response */}
                        {isLatestAssistant && !isBusy && !chatError && (
                          <div className="mt-3 pt-2.5 border-t border-zinc-800/70 flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 mr-1">
                              Follow-up:
                            </span>
                            {FOLLOW_UP_CHIPS.map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => submitPrompt(chip)}
                                className="px-2 py-0.5 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-[11px] text-zinc-300 hover:text-white transition-colors"
                              >
                                {chip}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isBusy && (
                  <div className="flex items-center space-x-2 text-xs font-mono text-zinc-400 px-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>
                      {status === "submitted"
                        ? "Grounding live levels & Strat context..."
                        : "Streaming Strat breakdown..."}
                    </span>
                  </div>
                )}

                {chatError && (
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 flex items-start justify-between gap-3 text-xs text-rose-300">
                    <div className="flex items-start space-x-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <div>
                        <div className="font-semibold text-rose-200">
                          Response Error
                        </div>
                        <div className="mt-0.5 text-rose-300/90">
                          {chatError.message || "Could not complete AI response."}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRegenerate()}
                      className="shrink-0 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 hover:bg-zinc-800 flex items-center space-x-1 font-mono text-[11px]"
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

          {/* Composer & Quick-Prompt Bar */}
          <div className="border-t border-zinc-800/80 bg-[#0c0c0e] px-3 sm:px-6 py-3 shrink-0">
            <div className="max-w-4xl mx-auto">
              {/* Quick-Prompt Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2">
                {QUICK_PROMPTS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      if (!input.trim()) {
                        submitPrompt(chip);
                      } else {
                        setInput((prev) => `${prev.trimEnd()} ${chip}`);
                        textareaRef.current?.focus();
                      }
                    }}
                    className="shrink-0 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-[11px] text-zinc-300 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Staged Screenshot Previews */}
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
                        className="w-12 h-12 rounded object-cover border border-zinc-800"
                      />
                      <div className="min-w-0 max-w-[160px]">
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
                        title="Remove screenshot"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input Box */}
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
                  title="Upload chart screenshot (or Drag & Drop / Cmd+V)"
                  aria-label="Upload chart screenshot"
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
                  placeholder={`Ask about ${selectedInstrument} Strat setups, FTFC, key levels, or paste (Cmd+V) a chart screenshot...`}
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

              <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-600 px-1">
                <span>Enter to send · Shift+Enter new line · Cmd+V or drop chart image</span>
                <span>Click any level pill above to insert into prompt</span>
              </div>
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
            alt="Chart fullscreen preview"
            className="max-w-full max-h-[90vh] object-contain rounded border border-zinc-800"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
