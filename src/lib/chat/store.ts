import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import {
  ChatMarketContextSnapshot,
  ChatMessageRecord,
  ChatThreadSummary,
  StratUIMessage,
} from "@/types/chat";

export const CHART_SCREENSHOTS_BUCKET = "chart-screenshots";
const SIGNED_URL_TTL_SECONDS = 3600;

export function isAllowedChatImageUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(url)) {
    return true;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  try {
    const allowedOrigin = new URL(supabaseUrl).origin;
    const parsed = new URL(url);
    return (
      parsed.origin === allowedOrigin &&
      parsed.pathname.startsWith(`/storage/v1/object/sign/${CHART_SCREENSHOTS_BUCKET}/`)
    );
  } catch {
    return false;
  }
}

export function extractStoragePathFromSignedUrl(
  url: string,
  userId: string
): string | null {
  if (!url || typeof url !== "string") return null;
  if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("data:")) {
    return url.startsWith(`${userId}/`) ? url : null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;

  try {
    const allowedOrigin = new URL(supabaseUrl).origin;
    const parsed = new URL(url);
    if (parsed.origin !== allowedOrigin) return null;
    const prefix = `/storage/v1/object/sign/${CHART_SCREENSHOTS_BUCKET}/`;
    if (!parsed.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
}

function inferImageMediaType(pathOrUrl: string): string {
  const lower = pathOrUrl.toLowerCase();
  if (lower.startsWith("data:image/")) {
    const m = lower.match(/^data:(image\/[a-z0-9+.-]+);base64,/);
    if (m) return m[1];
  }
  if (lower.includes(".jpg") || lower.includes(".jpeg")) return "image/jpeg";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/png";
}

export function deriveThreadTitle(text: string, hasImages: boolean): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return hasImages ? "NQ Chart Breakdown" : "New NQ Strat Session";
  }
  if (cleaned.length <= 48) return cleaned;
  return `${cleaned.slice(0, 45).trimEnd()}...`;
}

export function toUIMessages(records: ChatMessageRecord[]): StratUIMessage[] {
  return records
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => {
      const parts: StratUIMessage["parts"] = [];
      for (let i = 0; i < r.signedImageUrls.length; i++) {
        const url = r.signedImageUrls[i];
        if (!url) continue;
        parts.push({
          type: "file",
          filename: `chart-${i + 1}.png`,
          mediaType: inferImageMediaType(url),
          url,
        });
      }
      if (r.content) {
        parts.push({
          type: "text",
          text: r.content,
        });
      }
      return {
        id: r.id,
        role: r.role as "user" | "assistant",
        parts,
        metadata: {
          createdAt: r.createdAt,
          snapshot: r.marketContextSnapshot ?? undefined,
        },
      };
    });
}

export async function refreshSignedChatImageUrls(
  messages: StratUIMessage[],
  userId: string
): Promise<StratUIMessage[]> {
  const supabase = await createClient();
  if (!supabase || !userId || userId === "default") return messages;

  const pathsToSign = new Set<string>();
  for (const msg of messages) {
    for (const part of msg.parts || []) {
      if (part.type === "file" && typeof part.url === "string") {
        const storagePath = extractStoragePathFromSignedUrl(part.url, userId);
        if (storagePath) pathsToSign.add(storagePath);
      }
    }
  }

  if (pathsToSign.size === 0) return messages;

  const { data: signedData } = await supabase.storage
    .from(CHART_SCREENSHOTS_BUCKET)
    .createSignedUrls(Array.from(pathsToSign), SIGNED_URL_TTL_SECONDS);

  if (!signedData) return messages;

  const signedMap = new Map<string, string>();
  for (const item of signedData) {
    if (item.path && item.signedUrl) {
      signedMap.set(item.path, item.signedUrl);
    }
  }

  return messages.map((msg) => ({
    ...msg,
    parts: (msg.parts || []).map((part) => {
      if (part.type === "file" && typeof part.url === "string") {
        const storagePath = extractStoragePathFromSignedUrl(part.url, userId);
        const freshUrl = storagePath ? signedMap.get(storagePath) : undefined;
        if (freshUrl) {
          return { ...part, url: freshUrl };
        }
      }
      return part;
    }),
  }));
}

export async function listChatThreads(userId: string): Promise<ChatThreadSummary[]> {
  const supabase = await createClient();

  if (supabase) {
    const { data, error } = await supabase
      .from("chat_threads")
      .select("id, user_id, title, created_at, updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Supabase listChatThreads error:", error);
      return [];
    }

    return (data || []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      title: r.title,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, user_id, title, created_at, updated_at FROM chat_threads WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50"
    )
    .all(userId) as Array<{
    id: string;
    user_id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    title: r.title,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export async function createChatThread(
  userId: string,
  title = "New NQ Strat Session"
): Promise<ChatThreadSummary> {
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (supabase) {
    const { data, error } = await supabase
      .from("chat_threads")
      .insert({
        id,
        user_id: userId,
        title,
        created_at: now,
        updated_at: now,
      })
      .select("id, user_id, title, created_at, updated_at")
      .single();

    if (error || !data) {
      throw new Error(`Failed to create chat thread: ${error?.message || "unknown"}`);
    }

    return {
      id: data.id,
      userId: data.user_id,
      title: data.title,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  const db = getDb();
  db.prepare(
    "INSERT INTO chat_threads (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, userId, title, now, now);

  return {
    id,
    userId,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureChatThread(
  threadId: string | undefined,
  userId: string,
  titleHint?: string
): Promise<ChatThreadSummary> {
  const supabase = await createClient();

  if (threadId) {
    if (supabase) {
      const { data } = await supabase
        .from("chat_threads")
        .select("id, user_id, title, created_at, updated_at")
        .eq("id", threadId)
        .eq("user_id", userId)
        .maybeSingle();

      if (data) {
        return {
          id: data.id,
          userId: data.user_id,
          title: data.title,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      }
    } else {
      const db = getDb();
      const row = db
        .prepare(
          "SELECT id, user_id, title, created_at, updated_at FROM chat_threads WHERE id = ? AND user_id = ?"
        )
        .get(threadId, userId) as
        | {
            id: string;
            user_id: string;
            title: string;
            created_at: string;
            updated_at: string;
          }
        | undefined;
      if (row) {
        return {
          id: row.id,
          userId: row.user_id,
          title: row.title,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }
    }
  }

  return createChatThread(userId, titleHint || "New NQ Strat Session");
}

export async function updateChatThreadTitle(
  threadId: string,
  userId: string,
  title: string
): Promise<boolean> {
  const cleanTitle = title.trim().slice(0, 120);
  if (!cleanTitle) return false;

  const supabase = await createClient();
  if (supabase) {
    const { error } = await supabase
      .from("chat_threads")
      .update({ title: cleanTitle, updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("user_id", userId);
    return !error;
  }

  const db = getDb();
  const res = db
    .prepare("UPDATE chat_threads SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .run(cleanTitle, new Date().toISOString(), threadId, userId);
  return Number(res.changes || 0) > 0;
}

export async function deleteChatThread(
  threadId: string,
  userId: string
): Promise<boolean> {
  const supabase = await createClient();
  if (supabase) {
    const { error } = await supabase
      .from("chat_threads")
      .delete()
      .eq("id", threadId)
      .eq("user_id", userId);
    return !error;
  }

  const db = getDb();
  const res = db
    .prepare("DELETE FROM chat_threads WHERE id = ? AND user_id = ?")
    .run(threadId, userId);
  return Number(res.changes || 0) > 0;
}

export async function getChatThreadWithMessages(
  threadId: string,
  userId: string
): Promise<{ thread: ChatThreadSummary; messages: ChatMessageRecord[] } | null> {
  const supabase = await createClient();

  if (supabase) {
    const { data: threadRow, error: threadError } = await supabase
      .from("chat_threads")
      .select("id, user_id, title, created_at, updated_at")
      .eq("id", threadId)
      .eq("user_id", userId)
      .maybeSingle();

    if (threadError || !threadRow) {
      return null;
    }

    const { data: msgRows, error: msgError } = await supabase
      .from("chat_messages")
      .select("id, thread_id, role, content, image_urls, market_context_snapshot, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (msgError) {
      console.error("Supabase getChatThreadWithMessages error:", msgError);
      return {
        thread: {
          id: threadRow.id,
          userId: threadRow.user_id,
          title: threadRow.title,
          createdAt: threadRow.created_at,
          updatedAt: threadRow.updated_at,
        },
        messages: [],
      };
    }

    // Collect all storage paths that need fresh signed URLs
    const storagePaths = new Set<string>();
    for (const r of msgRows || []) {
      const urls = Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [];
      for (const u of urls) {
        if (
          u &&
          !u.startsWith("http://") &&
          !u.startsWith("https://") &&
          !u.startsWith("data:")
        ) {
          storagePaths.add(u);
        }
      }
    }

    const signedUrlMap = new Map<string, string>();
    if (storagePaths.size > 0) {
      const pathList = Array.from(storagePaths);
      const { data: signedData } = await supabase.storage
        .from(CHART_SCREENSHOTS_BUCKET)
        .createSignedUrls(pathList, SIGNED_URL_TTL_SECONDS);

      if (signedData) {
        for (const item of signedData) {
          if (item.path && item.signedUrl) {
            signedUrlMap.set(item.path, item.signedUrl);
          }
        }
      }
    }

    const messages: ChatMessageRecord[] = (msgRows || []).map((r) => {
      const rawUrls = Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [];
      const signedImageUrls = rawUrls
        .map((u) => {
          if (u.startsWith("http://") || u.startsWith("https://") || u.startsWith("data:")) {
            return u;
          }
          return signedUrlMap.get(u) || "";
        })
        .filter(Boolean);

      return {
        id: r.id,
        threadId: r.thread_id,
        role: r.role as ChatMessageRecord["role"],
        content: r.content || "",
        imageUrls: rawUrls,
        signedImageUrls,
        marketContextSnapshot:
          (r.market_context_snapshot as ChatMarketContextSnapshot | null) || null,
        createdAt: r.created_at,
      };
    });

    return {
      thread: {
        id: threadRow.id,
        userId: threadRow.user_id,
        title: threadRow.title,
        createdAt: threadRow.created_at,
        updatedAt: threadRow.updated_at,
      },
      messages,
    };
  }

  // SQLite fallback
  const db = getDb();
  const threadRow = db
    .prepare(
      "SELECT id, user_id, title, created_at, updated_at FROM chat_threads WHERE id = ? AND user_id = ?"
    )
    .get(threadId, userId) as
    | {
        id: string;
        user_id: string;
        title: string;
        created_at: string;
        updated_at: string;
      }
    | undefined;

  if (!threadRow) return null;

  const msgRows = db
    .prepare(
      "SELECT id, thread_id, role, content, image_urls_json, market_context_snapshot_json, created_at FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC"
    )
    .all(threadId) as Array<{
    id: string;
    thread_id: string;
    role: string;
    content: string;
    image_urls_json: string;
    market_context_snapshot_json: string | null;
    created_at: string;
  }>;

  const messages: ChatMessageRecord[] = msgRows.map((r) => {
    let urls: string[] = [];
    try {
      urls = JSON.parse(r.image_urls_json || "[]");
    } catch {
      urls = [];
    }
    let snap: ChatMarketContextSnapshot | null = null;
    if (r.market_context_snapshot_json) {
      try {
        snap = JSON.parse(r.market_context_snapshot_json);
      } catch {
        snap = null;
      }
    }
    return {
      id: r.id,
      threadId: r.thread_id,
      role: r.role as ChatMessageRecord["role"],
      content: r.content,
      imageUrls: urls,
      signedImageUrls: urls,
      marketContextSnapshot: snap,
      createdAt: r.created_at,
    };
  });

  return {
    thread: {
      id: threadRow.id,
      userId: threadRow.user_id,
      title: threadRow.title,
      createdAt: threadRow.created_at,
      updatedAt: threadRow.updated_at,
    },
    messages,
  };
}

export async function saveChatMessage(params: {
  id: string;
  threadId: string;
  role: "user" | "assistant" | "system";
  content: string;
  imageUrls?: string[];
  marketContextSnapshot?: ChatMarketContextSnapshot | null;
}): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const imageUrls = params.imageUrls || [];

  if (supabase) {
    const { error } = await supabase.from("chat_messages").upsert(
      {
        id: params.id,
        thread_id: params.threadId,
        role: params.role,
        content: params.content,
        image_urls: imageUrls,
        market_context_snapshot: params.marketContextSnapshot ?? null,
        created_at: now,
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("Supabase saveChatMessage error:", error);
      throw new Error(`Failed to save chat message: ${error.message}`);
    }
    return;
  }

  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO chat_messages (
      id, thread_id, role, content, image_urls_json, market_context_snapshot_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.id,
    params.threadId,
    params.role,
    params.content,
    JSON.stringify(imageUrls),
    params.marketContextSnapshot ? JSON.stringify(params.marketContextSnapshot) : null,
    now
  );

  db.prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ?").run(
    now,
    params.threadId
  );
}

export async function uploadChartScreenshot(params: {
  userId: string;
  threadId: string;
  buffer: Buffer;
  mimeType: string;
  originalFilename?: string;
}): Promise<{ storagePath: string; signedUrl: string }> {
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const ext = extMap[params.mimeType.toLowerCase()] || "png";
  const fileId = crypto.randomUUID();
  const storagePath = `${params.userId}/${params.threadId}/${fileId}.${ext}`;

  const supabase = await createClient();
  if (supabase) {
    const { error: uploadError } = await supabase.storage
      .from(CHART_SCREENSHOTS_BUCKET)
      .upload(storagePath, params.buffer, {
        contentType: params.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    const { data: signedData, error: signError } = await supabase.storage
      .from(CHART_SCREENSHOTS_BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signedData?.signedUrl) {
      throw new Error(`Failed to sign uploaded chart URL: ${signError?.message || "unknown"}`);
    }

    return {
      storagePath,
      signedUrl: signedData.signedUrl,
    };
  }

  // Local offline fallback when Supabase env vars are not configured
  const dataUrl = `data:${params.mimeType};base64,${params.buffer.toString("base64")}`;
  return {
    storagePath: dataUrl,
    signedUrl: dataUrl,
  };
}
