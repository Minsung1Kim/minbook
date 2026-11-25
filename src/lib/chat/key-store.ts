import { createClient } from "@/lib/supabase/server";
import { getDb } from "@/lib/db";
import { decryptApiKey, encryptApiKey, maskApiKey } from "./key-crypto";

export interface UserGeminiKeyStatus {
  aiConfigured: boolean;
  keyHint: string | null;
  keySource: "USER" | "ENV" | "NONE";
}

function getEnvGeminiKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
}

export async function getUserGeminiApiKeyStatus(
  userId: string
): Promise<UserGeminiKeyStatus> {
  const supabase = await createClient();

  if (supabase && userId && userId !== "default") {
    const { data, error } = await supabase
      .from("user_ai_keys")
      .select("key_hint")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data?.key_hint) {
      return {
        aiConfigured: true,
        keyHint: data.key_hint,
        keySource: "USER",
      };
    }
  } else if (!supabase) {
    const db = getDb();
    const row = db
      .prepare("SELECT key_hint FROM user_ai_keys WHERE user_id = ? LIMIT 1")
      .get(userId || "default") as { key_hint?: string } | undefined;

    if (row?.key_hint) {
      return {
        aiConfigured: true,
        keyHint: row.key_hint,
        keySource: "USER",
      };
    }
  }

  const envKey = getEnvGeminiKey();
  if (envKey) {
    return {
      aiConfigured: true,
      keyHint: maskApiKey(envKey),
      keySource: "ENV",
    };
  }

  return {
    aiConfigured: false,
    keyHint: null,
    keySource: "NONE",
  };
}

export async function resolveServerGeminiApiKey(userId: string): Promise<string> {
  const supabase = await createClient();

  if (supabase && userId && userId !== "default") {
    const { data, error } = await supabase
      .from("user_ai_keys")
      .select("gemini_api_key")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data?.gemini_api_key) {
      return decryptApiKey(data.gemini_api_key);
    }
  } else if (!supabase) {
    const db = getDb();
    const row = db
      .prepare("SELECT gemini_api_key FROM user_ai_keys WHERE user_id = ? LIMIT 1")
      .get(userId || "default") as { gemini_api_key?: string } | undefined;

    if (row?.gemini_api_key) {
      return decryptApiKey(row.gemini_api_key);
    }
  }

  return getEnvGeminiKey();
}

export async function validateGeminiApiKey(rawKey: string): Promise<{
  valid: boolean;
  error?: string;
}> {
  const clean = rawKey.trim();
  if (clean.length < 20 || /\s/.test(clean)) {
    return {
      valid: false,
      error: "Please enter a valid Google Gemini API key (no spaces).",
    };
  }

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash",
      {
        method: "GET",
        headers: {
          "x-goog-api-key": clean,
        },
        cache: "no-store",
      }
    );

    if (res.ok) {
      return { valid: true };
    }

    if (res.status === 400 || res.status === 401 || res.status === 403) {
      return {
        valid: false,
        error: "Google rejected this API key. Double-check it in Google AI Studio.",
      };
    }

    return {
      valid: false,
      error: `Could not verify key (status ${res.status}). Try again shortly.`,
    };
  } catch {
    return {
      valid: false,
      error: "Network error verifying API key with Google AI Studio.",
    };
  }
}

export async function saveUserGeminiApiKey(
  userId: string,
  rawKey: string
): Promise<UserGeminiKeyStatus> {
  const clean = rawKey.trim();
  const keyHint = maskApiKey(clean);
  const encrypted = encryptApiKey(clean);
  const now = new Date().toISOString();

  const supabase = await createClient();
  if (supabase && userId && userId !== "default") {
    const { error } = await supabase.from("user_ai_keys").upsert(
      {
        user_id: userId,
        gemini_api_key: encrypted,
        key_hint: keyHint,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

    if (error) {
      throw new Error(`Failed to save API key: ${error.message}`);
    }
  } else {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO user_ai_keys (user_id, gemini_api_key, key_hint, updated_at)
       VALUES (?, ?, ?, ?)`
    ).run(userId || "default", encrypted, keyHint, now);
  }

  return {
    aiConfigured: true,
    keyHint,
    keySource: "USER",
  };
}

export async function deleteUserGeminiApiKey(
  userId: string
): Promise<UserGeminiKeyStatus> {
  const supabase = await createClient();
  if (supabase && userId && userId !== "default") {
    await supabase.from("user_ai_keys").delete().eq("user_id", userId);
  } else {
    const db = getDb();
    db.prepare("DELETE FROM user_ai_keys WHERE user_id = ?").run(userId || "default");
  }

  return getUserGeminiApiKeyStatus(userId);
}
