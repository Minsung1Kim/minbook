import { createGoogle } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import { buildMarketContext } from "@/lib/chat/build-market-context";
import {
  deriveThreadTitle,
  ensureChatThread,
  extractStoragePathFromSignedUrl,
  isAllowedChatImageUrl,
  refreshSignedChatImageUrls,
  saveChatMessage,
  updateChatThreadTitle,
} from "@/lib/chat/store";
import { CHAT_MODEL_ID, StratUIMessage } from "@/types/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getServerGeminiApiKey(): string {
  return (
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    ""
  );
}

function extractTextFromParts(parts: StratUIMessage["parts"] | undefined): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();
}

function sanitizeUIMessages(messages: StratUIMessage[]): StratUIMessage[] {
  return messages.map((msg) => ({
    ...msg,
    parts: (msg.parts || []).filter((part) => {
      if (part.type === "file") {
        return typeof part.url === "string" && isAllowedChatImageUrl(part.url);
      }
      return true;
    }),
  }));
}

function formatSafeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err || "Unknown AI error");
  // Redact any accidental API key or key= query param from upstream errors
  const redacted = raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]");

  if (redacted.includes("API_KEY_INVALID") || redacted.includes("API key not valid")) {
    return "The configured GEMINI_API_KEY appears invalid. Verify it in Google AI Studio and update your server environment variable.";
  }
  if (redacted.includes("429") || redacted.toLowerCase().includes("quota")) {
    return "Free Gemini API rate limit reached. Wait a few seconds and retry.";
  }
  return `Chat error: ${redacted}`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Please sign in to use MinBook AI Chat" },
        { status: 401 }
      );
    }

    const apiKey = getServerGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "GEMINI_API_KEY is not configured. Add a free Google AI Studio key to your server environment variables.",
        },
        { status: 503 }
      );
    }

    const body = await request.json();
    const rawMessages: StratUIMessage[] = Array.isArray(body?.messages) ? body.messages : [];
    const requestedThreadId =
      typeof body?.threadId === "string" && body.threadId.trim()
        ? body.threadId.trim()
        : undefined;
    const symbolParam =
      typeof body?.symbol === "string" && body.symbol.toUpperCase().startsWith("MNQ")
        ? "MNQ"
        : "NQ";
    const attachmentPathsMap: Record<string, string> =
      body?.attachmentPaths && typeof body.attachmentPaths === "object"
        ? body.attachmentPaths
        : {};

    if (rawMessages.length === 0) {
      return NextResponse.json(
        { success: false, error: "At least one message is required" },
        { status: 400 }
      );
    }

    const sanitizedMessages = await refreshSignedChatImageUrls(
      sanitizeUIMessages(rawMessages),
      auth.userId
    );
    const lastUserMessage = [...sanitizedMessages]
      .reverse()
      .find((m) => m.role === "user");

    const userText = extractTextFromParts(lastUserMessage?.parts);
    const userFileParts = (lastUserMessage?.parts || []).filter(
      (p): p is Extract<StratUIMessage["parts"][number], { type: "file" }> => p.type === "file"
    );

    const thread = await ensureChatThread(
      requestedThreadId,
      auth.userId,
      deriveThreadTitle(userText, userFileParts.length > 0)
    );

    if (
      thread.title === "New NQ Strat Session" &&
      (userText.length > 0 || userFileParts.length > 0)
    ) {
      await updateChatThreadTitle(
        thread.id,
        auth.userId,
        deriveThreadTitle(userText, userFileParts.length > 0)
      ).catch(() => {});
    }

    // Gather live market context, Strat & Research docs, and user trade journal
    const { snapshot, systemPrompt } = await buildMarketContext({
      symbol: symbolParam,
      userId: auth.userId,
    });

    if (lastUserMessage) {
      const storedImageUrls = userFileParts
        .map((fp) => {
          const mappedPath = attachmentPathsMap[fp.url];
          if (mappedPath && mappedPath.startsWith(`${auth.userId}/`)) {
            return mappedPath;
          }
          const extracted = extractStoragePathFromSignedUrl(fp.url, auth.userId);
          return extracted || fp.url;
        })
        .filter(Boolean);

      await saveChatMessage({
        id: lastUserMessage.id || crypto.randomUUID(),
        threadId: thread.id,
        role: "user",
        content: userText,
        imageUrls: storedImageUrls,
        marketContextSnapshot: snapshot,
      });
    }

    const google = createGoogle({ apiKey });
    const modelMessages = await convertToModelMessages(sanitizedMessages);

    const result = streamText({
      model: google(CHAT_MODEL_ID),
      instructions: systemPrompt,
      messages: modelMessages,
    });

    return createUIMessageStreamResponse({
      headers: {
        "X-Chat-Thread-Id": thread.id,
      },
      stream: toUIMessageStream({
        stream: result.stream,
        originalMessages: sanitizedMessages,
        generateMessageId: () => crypto.randomUUID(),
        messageMetadata: ({ part }) => {
          if (part.type === "start") {
            return {
              createdAt: new Date().toISOString(),
              model: CHAT_MODEL_ID,
              snapshot,
            };
          }
          return undefined;
        },
        onError: (err) => formatSafeError(err),
        onEnd: async ({ responseMessage, isAborted }) => {
          const assistantText = extractTextFromParts(responseMessage?.parts);
          if (!assistantText) return;

          const finalText = isAborted ? `${assistantText}\n\n_[Response stopped]_` : assistantText;
          try {
            await saveChatMessage({
              id: responseMessage.id || crypto.randomUUID(),
              threadId: thread.id,
              role: "assistant",
              content: finalText,
              imageUrls: [],
              marketContextSnapshot: snapshot,
            });
          } catch (saveErr) {
            console.error("Failed to persist assistant chat message:", saveErr);
          }
        },
      }),
    });
  } catch (error: unknown) {
    console.error("API /api/chat POST error");
    return NextResponse.json(
      { success: false, error: formatSafeError(error) },
      { status: 500 }
    );
  }
}
