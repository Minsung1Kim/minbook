import { createGoogle } from "@ai-sdk/google";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  jsonSchema,
  streamText,
  tool,
  toUIMessageStream,
  type InferUIMessageChunk,
  type UIMessageStreamWriter,
} from "ai";
import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import { buildMarketContext } from "@/lib/chat/build-market-context";
import { resolveServerGeminiApiKey } from "@/lib/chat/key-store";
import {
  computeScalpVerdict,
  computeScreenshotQuantMetrics,
  ScreenshotQuantInput,
} from "@/lib/chat/screenshot-quant";
import { queryPersonalJournal } from "@/lib/chat/journal-ingest";
import {
  buildDeterministicAssistantReply,
  extractChartState,
  formatScalperCard5Lines,
  isConversationalAssistantQuery,
  isModelFallbackEligibleError,
  isRateLimitError,
  renderScalperCardDeterministic,
  renderScalperCardStream,
  resolveChatMode,
  STATIC_SCALP_SYSTEM_PREFIX,
} from "@/lib/chat/scalp-pipeline";
import {
  deriveThreadTitle,
  ensureChatThread,
  extractStoragePathFromSignedUrl,
  isAllowedChatImageUrl,
  refreshSignedChatImageUrls,
  saveChatMessage,
  updateChatThreadTitle,
} from "@/lib/chat/store";
import {
  CHAT_FALLBACK_MODELS,
  CHAT_MODEL_ID,
  ChatMarketContextSnapshot,
  ChatModePreference,
  ExtractedChartState,
  ScalpAccountProfile,
  StratUIMessage,
} from "@/types/chat";
import { AccountDrawdownMode } from "@/types/market";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function extractTextFromParts(parts: StratUIMessage["parts"] | undefined): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter(
      (p): p is { type: "text"; text: string } =>
        p.type === "text" && typeof p.text === "string"
    )
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
  const redacted = raw
    .replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]")
    .replace(/([?&]key=)[^&\s]+/gi, "$1[REDACTED]");

  if (redacted.includes("API_KEY_INVALID") || redacted.includes("API key not valid")) {
    return "The configured GEMINI_API_KEY appears invalid. Verify it in Google AI Studio and update your server environment variable.";
  }
  if (isRateLimitError(redacted)) {
    return "Free Gemini API rate limit reached across Flash-Lite & Flash. Retry in a few seconds.";
  }
  return `Chat error: ${redacted}`;
}

function parseAccountDrawdownMode(raw: unknown): AccountDrawdownMode {
  if (raw === "EOD_TRAILING" || raw === "CASH_LIVE" || raw === "INTRADAY_UNREALIZED") {
    return raw;
  }
  return "INTRADAY_UNREALIZED";
}

function parseChatModePreference(raw: unknown): ChatModePreference {
  if (raw === "LIVE_SCALP" || raw === "DEEP_DIVE" || raw === "AUTO") {
    return raw;
  }
  return "AUTO";
}

function writeStaticTextToWriter(
  writer: UIMessageStreamWriter<StratUIMessage>,
  text: string,
  snapshot: ChatMarketContextSnapshot,
  modelLabel: string
) {
  const partId = crypto.randomUUID();
  writer.write({
    type: "start",
    messageMetadata: {
      createdAt: new Date().toISOString(),
      model: modelLabel,
      snapshot,
    },
  });
  writer.write({ type: "text-start", id: partId });
  writer.write({ type: "text-delta", id: partId, delta: text });
  writer.write({ type: "text-end", id: partId });
  writer.write({ type: "finish" });
}

/**
 * Attempts to drain a UIMessageStream; returns { emittedContent, rateLimited }.
 * Only forwards chunks once we know the stream didn't immediately fail with 429 before any output.
 */
async function tryForwardStream(
  uiStream: ReadableStream<InferUIMessageChunk<StratUIMessage>>,
  writer: UIMessageStreamWriter<StratUIMessage>
): Promise<{ emittedContent: boolean; rateLimited: boolean; errorText?: string }> {
  const reader = uiStream.getReader();
  const buffered: Array<InferUIMessageChunk<StratUIMessage>> = [];
  let flushed = false;
  let emittedContent = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      if (value.type === "error") {
        if (!emittedContent && isModelFallbackEligibleError(value.errorText)) {
          await reader.cancel().catch(() => {});
          return { emittedContent: false, rateLimited: true, errorText: value.errorText };
        }
        if (!flushed) {
          for (const c of buffered) writer.write(c);
          flushed = true;
        }
        writer.write(value);
        return { emittedContent, rateLimited: false, errorText: value.errorText };
      }

      if (
        value.type === "text-delta" ||
        value.type === "tool-input-start" ||
        value.type === "tool-output-available"
      ) {
        emittedContent = true;
        if (!flushed) {
          for (const c of buffered) writer.write(c);
          flushed = true;
        }
        writer.write(value);
      } else if (flushed) {
        writer.write(value);
      } else {
        buffered.push(value);
      }
    }

    if (!flushed) {
      for (const c of buffered) writer.write(c);
    }
    return { emittedContent, rateLimited: false };
  } catch (err) {
    if (!emittedContent && isModelFallbackEligibleError(err)) {
      return {
        emittedContent: false,
        rateLimited: true,
        errorText: err instanceof Error ? err.message : String(err),
      };
    }
    throw err;
  } finally {
    reader.releaseLock();
  }
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

    const apiKey = await resolveServerGeminiApiKey(auth.userId);
    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No Gemini API key saved yet. Paste your free Google AI Studio key in the bar above to start chatting.",
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
    const accountDrawdownMode = parseAccountDrawdownMode(body?.accountDrawdownMode);
    const chatModePref = parseChatModePreference(body?.chatMode);
    const sessionStreak =
      typeof body?.sessionStreak === "number" && Number.isFinite(body.sessionStreak)
        ? body.sessionStreak
        : undefined;
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

    const resolvedMode = resolveChatMode({
      userText,
      modePreference: chatModePref,
    });

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

    const modelMessages = await convertToModelMessages(sanitizedMessages);
    const accountProfile: ScalpAccountProfile = {
      accountDrawdownMode,
      riskBudgetDollars: snapshot.journal.riskBudgetDollars,
      sessionStreak,
    };

    // Deterministic 4-step pipeline when chart screenshot(s) are attached
    if (userFileParts.length > 0) {
      const imageUrls = userFileParts.map((fp) => fp.url).filter(Boolean);
      let chartState: ExtractedChartState;
      try {
        chartState = await extractChartState({
          apiKey,
          imageUrls,
          userText,
          snapshot,
        });
      } catch (extractErr) {
        if (!isModelFallbackEligibleError(extractErr)) {
          throw extractErr;
        }
        chartState = {
          instrument: symbolParam,
          liveSpot: snapshot.quote.price,
          timeframe: "1m",
          orderState: "ANALYSIS_ONLY",
          direction: "NONE",
          entryPx: null,
          entryZoneLow: null,
          entryZoneHigh: null,
          stopPx: null,
          tp1Px: null,
          tp2Px: null,
          contracts: 1,
          detectedSetupArchetype: "UNKNOWN",
          visibleKeyLevels: [],
        };
      }

      const verdict = computeScalpVerdict(chartState, snapshot, accountProfile);
      const journalContext = await queryPersonalJournal({
        setupArchetype: verdict.detectedSetupArchetype,
        gexRegime: verdict.netGammaRegime,
        playbookArchetype: snapshot.regime.archetype,
        sessionWindow: verdict.sessionWindow,
        sessionStreak,
        userId: auth.userId,
      });

      // Hot Path (LIVE_SCALP): zero wasted second LLM call — stream deterministic 5-line Scalper Card directly
      if (resolvedMode === "LIVE_SCALP") {
        const cardText = formatScalperCard5Lines(verdict, journalContext);
        const uiStream = createUIMessageStream<StratUIMessage>({
          originalMessages: sanitizedMessages,
          generateId: () => crypto.randomUUID(),
          execute: ({ writer }) => {
            writeStaticTextToWriter(writer, cardText, snapshot, CHAT_MODEL_ID);
          },
          onFinish: async ({ responseMessage }) => {
            const assistantText = extractTextFromParts(responseMessage?.parts);
            if (!assistantText) return;
            await saveChatMessage({
              id: responseMessage.id || crypto.randomUUID(),
              threadId: thread.id,
              role: "assistant",
              content: assistantText,
              imageUrls: [],
              marketContextSnapshot: snapshot,
            }).catch((saveErr) =>
              console.error("Failed to persist assistant chat message:", saveErr)
            );
          },
        });

        return createUIMessageStreamResponse({
          headers: {
            "X-Chat-Thread-Id": thread.id,
            "X-Chat-Mode": resolvedMode,
          },
          stream: uiStream,
        });
      }

      // Cold Path (DEEP_DIVE) with Flash-Lite -> Flash fallback chain -> deterministic fallback
      const uiStream = createUIMessageStream<StratUIMessage>({
        originalMessages: sanitizedMessages,
        generateId: () => crypto.randomUUID(),
        execute: async ({ writer }) => {
          const modelsToTry = Array.from(new Set([CHAT_MODEL_ID, ...CHAT_FALLBACK_MODELS]));
          for (const modelId of modelsToTry) {
            const res = renderScalperCardStream({
              apiKey,
              mode: "DEEP_DIVE",
              verdict,
              journal: journalContext,
              systemPrompt,
              messages: modelMessages,
              modelId,
            });
            const uiReadable = toUIMessageStream({
              stream: res.stream,
              originalMessages: sanitizedMessages,
              generateMessageId: () => crypto.randomUUID(),
              messageMetadata: ({ part }) =>
                part.type === "start"
                  ? { createdAt: new Date().toISOString(), model: modelId, snapshot }
                  : undefined,
              onError: (err) => formatSafeError(err),
            }) as ReadableStream<InferUIMessageChunk<StratUIMessage>>;

            const outcome = await tryForwardStream(uiReadable, writer);
            if (!outcome.rateLimited) return;
          }

          const fallback = renderScalperCardDeterministic(
            verdict,
            journalContext,
            "DEEP_DIVE"
          ).text;
          writeStaticTextToWriter(writer, fallback, snapshot, "minbook-deterministic");
        },
        onFinish: async ({ responseMessage, isAborted }) => {
          const assistantText = extractTextFromParts(responseMessage?.parts);
          if (!assistantText) return;
          const finalText = isAborted ? `${assistantText}\n\n_[Response stopped]_` : assistantText;
          await saveChatMessage({
            id: responseMessage.id || crypto.randomUUID(),
            threadId: thread.id,
            role: "assistant",
            content: finalText,
            imageUrls: [],
            marketContextSnapshot: snapshot,
          }).catch((saveErr) =>
            console.error("Failed to persist assistant chat message:", saveErr)
          );
        },
      });

      return createUIMessageStreamResponse({
        headers: {
          "X-Chat-Thread-Id": thread.id,
          "X-Chat-Mode": resolvedMode,
        },
        stream: uiStream,
      });
    }

    // Text-only / follow-up path with Flash-Lite -> Flash -> Deterministic MinBook Fallback
    const isConversational = isConversationalAssistantQuery(userText, false);
    const useStrictHotPathText = resolvedMode === "LIVE_SCALP" && !isConversational;
    const google = createGoogle({ apiKey });

    const runTextModel = (modelId: string) =>
      streamText({
        model: google(modelId),
        instructions: useStrictHotPathText
          ? `${STATIC_SCALP_SYSTEM_PREFIX}\n\n${systemPrompt}\n\nMode: LIVE_SCALP (keep answers ultra-concise, <= 5 lines, zero fluff).`
          : `${systemPrompt}\n\nAssistant Directive: Answer the trader's question directly, naturally, and practically like an experienced desk co-pilot. Do NOT parrot "Based on the MinBook Live Market Snapshot: The current Bias Verdict is..." — synthesize the holiday/half-day schedule, upcoming economic releases, volatility regime, key levels, and journal context to actually help them make a smart decision.`,
        messages: modelMessages,
        stopWhen: isStepCount(4),
        maxOutputTokens: useStrictHotPathText ? 280 : 1400,
        providerOptions: useStrictHotPathText
          ? {
              google: {
                thinkingConfig: {
                  thinkingBudget: 0,
                  includeThoughts: false,
                },
              },
            }
          : undefined,
        tools: {
          compute_scalp_verdict: tool({
            description:
              "Runs deterministic MinBook scalp verdict: re-anchors levels to liveSpot, enforces >90s stale feed lag guard, computes diurnal sqrt(252) EM, absorbing double-barrier hit odds, volatility-scaled stop sanity, MNQ sizing, and prop-firm drawdown exit directives.",
            inputSchema: jsonSchema<ExtractedChartState>({
              type: "object",
              properties: {
                instrument: { type: "string", enum: ["NQ", "MNQ"] },
                liveSpot: { type: "number" },
                timeframe: { type: "string" },
                orderState: {
                  type: "string",
                  enum: [
                    "OPEN_POSITION",
                    "PENDING_LIMIT_ORDER",
                    "MARKET_ENTRY_NOW",
                    "ANALYSIS_ONLY",
                  ],
                },
                direction: { type: "string", enum: ["LONG", "SHORT", "NONE"] },
                entryPx: { type: ["number", "null"] },
                entryZoneLow: { type: ["number", "null"] },
                entryZoneHigh: { type: ["number", "null"] },
                stopPx: { type: ["number", "null"] },
                tp1Px: { type: ["number", "null"] },
                tp2Px: { type: ["number", "null"] },
                contracts: { type: "number" },
                detectedSetupArchetype: {
                  type: "string",
                  enum: [
                    "SWEEP_MSS_REVERSAL",
                    "RETRACE_CONTINUATION",
                    "VWAP_ONMID_PULLBACK",
                    "OPEN_RANGE_BREAK",
                    "UNKNOWN",
                  ],
                },
                visibleKeyLevels: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string" },
                      price: { type: "number" },
                    },
                    required: ["label", "price"],
                  },
                },
              },
              required: ["liveSpot"],
            }),
            execute: async (input) => computeScalpVerdict(input, snapshot, accountProfile),
          }),
          query_personal_journal: tool({
            description:
              "Queries the user's persisted journal_trades for matching setupArchetype, gexRegime, playbookArchetype, and sessionWindow with Bayesian shrinkage and TILT_WARNING detection.",
            inputSchema: jsonSchema<{
              setupArchetype: string;
              gexRegime?: string;
              playbookArchetype?: string;
              sessionWindow: string;
            }>({
              type: "object",
              properties: {
                setupArchetype: { type: "string" },
                gexRegime: { type: "string" },
                playbookArchetype: { type: "string" },
                sessionWindow: { type: "string" },
              },
              required: ["setupArchetype", "sessionWindow"],
            }),
            execute: async (input) =>
              queryPersonalJournal({
                ...input,
                sessionStreak,
                userId: auth.userId,
              }),
          }),
          runMinBookQuantAnalysis: tool({
            description:
              "Legacy alias for deterministic MinBook quantitative trade metrics anchored to liveSpot.",
            inputSchema: jsonSchema<ScreenshotQuantInput>({
              type: "object",
              properties: {
                instrument: { type: "string", enum: ["NQ", "MNQ"] },
                timeframe: { type: "string" },
                screenshotCurrentPrice: { type: "number" },
                direction: { type: "string", enum: ["LONG", "SHORT", "NONE"] },
                orderType: { type: "string", enum: ["LIMIT", "MARKET", "STOP", "UNKNOWN"] },
                positionStatus: { type: "string", enum: ["OPEN", "PLANNED_FLAT", "UNKNOWN"] },
                entryPrice: { type: "number" },
                entryZoneLow: { type: "number" },
                entryZoneHigh: { type: "number" },
                stopLossPrice: { type: "number" },
                targetPrice: { type: "number" },
                contracts: { type: "number" },
                accountBalance: { type: "number" },
                openPnlDollars: { type: "number" },
                newsCountdownMinutes: { type: "number" },
                newsImpact: {
                  type: "string",
                  enum: ["RED_HIGH", "ORANGE_MEDIUM", "YELLOW_LOW", "UNKNOWN"],
                },
                newsEventName: { type: "string" },
                candleOpen: { type: "number" },
                candleHigh: { type: "number" },
                candleLow: { type: "number" },
                candleClose: { type: "number" },
              },
              required: ["screenshotCurrentPrice"],
            }),
            execute: async (input) => computeScreenshotQuantMetrics(input, snapshot),
          }),
        },
      });

    const uiStream = createUIMessageStream<StratUIMessage>({
      originalMessages: sanitizedMessages,
      generateId: () => crypto.randomUUID(),
      execute: async ({ writer }) => {
        const modelsToTry = Array.from(new Set([CHAT_MODEL_ID, ...CHAT_FALLBACK_MODELS]));
        for (const modelId of modelsToTry) {
          const result = runTextModel(modelId);
          const uiReadable = toUIMessageStream({
            stream: result.stream,
            originalMessages: sanitizedMessages,
            generateMessageId: () => crypto.randomUUID(),
            messageMetadata: ({ part }) =>
              part.type === "start"
                ? { createdAt: new Date().toISOString(), model: modelId, snapshot }
                : undefined,
            onError: (err) => formatSafeError(err),
          }) as ReadableStream<InferUIMessageChunk<StratUIMessage>>;

          const outcome = await tryForwardStream(uiReadable, writer);
          if (!outcome.rateLimited) return;
        }

        // Tier 3: Zero-failure deterministic fallback when both free Gemini pools hit 429
        const journal = await queryPersonalJournal({
          setupArchetype: "UNKNOWN",
          gexRegime: snapshot.gex.netGammaRegime,
          playbookArchetype: snapshot.regime.archetype,
          sessionWindow: "NY_OPEN_0930_1000",
          sessionStreak,
          userId: auth.userId,
        });
        const deterministicReply = buildDeterministicAssistantReply({
          userText,
          snapshot,
          journal,
        });
        writeStaticTextToWriter(
          writer,
          deterministicReply,
          snapshot,
          "minbook-deterministic"
        );
      },
      onFinish: async ({ responseMessage, isAborted }) => {
        const assistantText = extractTextFromParts(responseMessage?.parts);
        if (!assistantText) return;
        const finalText = isAborted ? `${assistantText}\n\n_[Response stopped]_` : assistantText;
        await saveChatMessage({
          id: responseMessage.id || crypto.randomUUID(),
          threadId: thread.id,
          role: "assistant",
          content: finalText,
          imageUrls: [],
          marketContextSnapshot: snapshot,
        }).catch((saveErr) =>
          console.error("Failed to persist assistant chat message:", saveErr)
        );
      },
    });

    return createUIMessageStreamResponse({
      headers: {
        "X-Chat-Thread-Id": thread.id,
        "X-Chat-Mode": resolvedMode,
      },
      stream: uiStream,
    });
  } catch (error: unknown) {
    console.error("API /api/chat POST error");
    return NextResponse.json(
      { success: false, error: formatSafeError(error) },
      { status: 500 }
    );
  }
}
