import { describe, it, expect } from "vitest";
import {
  buildMarketContext,
  buildSystemPromptFromContext,
  resolveStalenessBadge,
} from "../lib/chat/build-market-context";
import {
  createChatThread,
  deleteChatThread,
  deriveThreadTitle,
  extractStoragePathFromSignedUrl,
  getChatThreadWithMessages,
  isAllowedChatImageUrl,
  listChatThreads,
  saveChatMessage,
  toUIMessages,
  uploadChartScreenshot,
} from "../lib/chat/store";
import { decryptApiKey, encryptApiKey, maskApiKey } from "../lib/chat/key-crypto";
import {
  deleteUserGeminiApiKey,
  getUserGeminiApiKeyStatus,
  resolveServerGeminiApiKey,
  saveUserGeminiApiKey,
} from "../lib/chat/key-store";
import { buildPlainEnglishBrief } from "../lib/market/plainEnglishBrief";
import { computeScreenshotQuantMetrics } from "../lib/chat/screenshot-quant";
import { getOpenBrief } from "../lib/market/service";

describe("MinBook Strat AI Chat Grounding & Helpers", () => {
  it("resolves staleness badges honestly from status and age", () => {
    expect(resolveStalenessBadge("LIVE", 12)).toBe("FRESH");
    expect(resolveStalenessBadge("LIVE", 400)).toBe("STALE");
    expect(resolveStalenessBadge("DELAYED", 30)).toBe("DELAYED");
    expect(resolveStalenessBadge("SAMPLE", 5)).toBe("SAMPLE");
  });

  it("builds live NQ market context with Strat rules, levels, and data honesty metadata", async () => {
    const { snapshot, systemPrompt } = await buildMarketContext({
      symbol: "NQ",
      userId: "default",
    });

    expect(snapshot.instrument).toBe("NQ");
    expect(snapshot.quote.price).toBeGreaterThan(0);
    expect(snapshot.quote.source).toBeTruthy();
    expect(snapshot.quote.timestamp).toBeTruthy();
    expect(["FRESH", "DELAYED", "STALE", "SAMPLE"]).toContain(
      snapshot.quote.stalenessBadge
    );
    expect(snapshot.keyLevels.length).toBeGreaterThan(3);
    for (const lvl of snapshot.keyLevels) {
      expect(lvl.source).toBeTruthy();
      expect(lvl.timestamp).toBeTruthy();
      expect(["FRESH", "DELAYED", "STALE", "SAMPLE"]).toContain(lvl.staleness);
    }

    // Verify Strat terminology & MinBook research grounding in prompt
    expect(systemPrompt).toContain("THE STRAT");
    expect(systemPrompt).toContain("2-1-2");
    expect(systemPrompt).toContain("3-1-2");
    expect(systemPrompt).toContain("FTFC");
    expect(systemPrompt).toContain("Never fabricate prices");
    expect(systemPrompt).toContain(snapshot.quote.source);
  });

  it("validates chat image URLs to prevent SSRF while allowing base64 data URLs and Supabase signed URLs", () => {
    expect(
      isAllowedChatImageUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=")
    ).toBe(true);
    expect(isAllowedChatImageUrl("https://evil.example.com/ssrf.png")).toBe(false);
    expect(isAllowedChatImageUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
  });

  it("derives concise thread titles and converts persisted messages to AI SDK UIMessages", () => {
    expect(deriveThreadTitle("   ", true)).toBe("NQ Chart Breakdown");
    expect(deriveThreadTitle("Check 15m 2-1-2 reversal at ONH", false)).toBe(
      "Check 15m 2-1-2 reversal at ONH"
    );

    const uiMsgs = toUIMessages([
      {
        id: "m1",
        threadId: "t1",
        role: "user",
        content: "Break down this setup",
        imageUrls: ["user1/t1/chart.png"],
        signedImageUrls: ["https://example.supabase.co/signed/chart.png"],
        marketContextSnapshot: null,
        createdAt: new Date().toISOString(),
      },
      {
        id: "m2",
        threadId: "t1",
        role: "assistant",
        content: "2D-1-2U trigger observed.",
        imageUrls: [],
        signedImageUrls: [],
        marketContextSnapshot: null,
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(uiMsgs).toHaveLength(2);
    expect(uiMsgs[0].parts).toHaveLength(2);
    expect(uiMsgs[0].parts[0].type).toBe("file");
    expect(uiMsgs[0].parts[1].type).toBe("text");
    expect(uiMsgs[1].parts).toHaveLength(1);
  });

  it("extracts canonical storage path only for the owning user", () => {
    const path = extractStoragePathFromSignedUrl("user-123/thread-1/img.png", "user-123");
    expect(path).toBe("user-123/thread-1/img.png");
    expect(extractStoragePathFromSignedUrl("other-user/thread-1/img.png", "user-123")).toBeNull();
  });

  it("formats system prompt cleanly from a snapshot", async () => {
    const { snapshot } = await buildMarketContext({ symbol: "MNQ", userId: "default" });
    const prompt = buildSystemPromptFromContext(snapshot);
    expect(prompt).toContain("MNQ");
    expect(prompt).toContain("USER TRADE JOURNAL");
  });

  it("persists uploaded screenshots, messages, and context snapshots across thread reload", async () => {
    const testUser = "vitest-chat-user";
    const thread = await createChatThread(testUser, "Test Strat Thread");
    try {
      const tinyPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64"
      );
      const upload = await uploadChartScreenshot({
        userId: testUser,
        threadId: thread.id,
        buffer: tinyPng,
        mimeType: "image/png",
        originalFilename: "nq-15m.png",
      });
      expect(upload.signedUrl).toBeTruthy();

      const { snapshot } = await buildMarketContext({ symbol: "NQ", userId: testUser });
      await saveChatMessage({
        id: "msg-user-1",
        threadId: thread.id,
        role: "user",
        content: "Break down this 2-1-2 setup",
        imageUrls: [upload.storagePath],
        marketContextSnapshot: snapshot,
      });
      await saveChatMessage({
        id: "msg-ast-1",
        threadId: thread.id,
        role: "assistant",
        content: "Observed 2D-1-2U bullish reversal near Session VWAP.",
        imageUrls: [],
        marketContextSnapshot: snapshot,
      });

      const threads = await listChatThreads(testUser);
      expect(threads.some((t) => t.id === thread.id)).toBe(true);

      const loaded = await getChatThreadWithMessages(thread.id, testUser);
      expect(loaded).not.toBeNull();
      expect(loaded!.messages).toHaveLength(2);
      expect(loaded!.messages[0].signedImageUrls[0]).toBeTruthy();
      expect(loaded!.messages[1].marketContextSnapshot?.quote.price).toBe(
        snapshot.quote.price
      );

      const uiMessages = toUIMessages(loaded!.messages);
      expect(uiMessages).toHaveLength(2);
      expect(uiMessages[0].parts[0].type).toBe("file");
      expect(uiMessages[1].metadata?.snapshot?.quote.price).toBe(snapshot.quote.price);
      expect(uiMessages[1].metadata?.createdAt).toBeTruthy();
    } finally {
      await deleteChatThread(thread.id, testUser);
    }
  });

  it("encrypts, saves, masks, resolves, and deletes per-user Gemini API keys safely", async () => {
    process.env.MINBOOK_KEY_SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const sampleKey = "AIzaSyTestExampleKeyForUnitTesting1234";
    const encrypted = encryptApiKey(sampleKey);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);
    expect(encrypted).not.toContain(sampleKey);
    expect(decryptApiKey(encrypted)).toBe(sampleKey);
    expect(maskApiKey(sampleKey)).toBe("AIza••••1234");

    const testUser = "vitest-key-user";
    try {
      const savedStatus = await saveUserGeminiApiKey(testUser, sampleKey);
      expect(savedStatus.aiConfigured).toBe(true);
      expect(savedStatus.keyHint).toBe("AIza••••1234");
      expect(savedStatus.keySource).toBe("USER");

      const statusCheck = await getUserGeminiApiKeyStatus(testUser);
      expect(statusCheck.aiConfigured).toBe(true);
      expect(statusCheck.keyHint).toBe("AIza••••1234");
      expect(JSON.stringify(statusCheck)).not.toContain(sampleKey);

      const resolved = await resolveServerGeminiApiKey(testUser);
      expect(resolved).toBe(sampleKey);
    } finally {
      await deleteUserGeminiApiKey(testUser);
    }
  });

  it("generates concise 1H, 4H, and Day horizon predictions on the Brief", async () => {
    const brief = await getOpenBrief({ symbol: "NQ" });
    const plain = buildPlainEnglishBrief(brief);
    expect(plain.horizonPredictions).toHaveLength(3);
    expect(plain.horizonPredictions.map((p) => p.horizon)).toEqual(["1H", "4H", "DAY"]);
    for (const item of plain.horizonPredictions) {
      expect(item.summary.length).toBeGreaterThan(15);
      expect(["BULLISH", "BEARISH", "NEUTRAL"]).toContain(item.bias);
    }
  });

  it("computes deterministic quant formulas & live re-anchored advice from screenshot numbers", async () => {
    const { snapshot, systemPrompt } = await buildMarketContext({ symbol: "MNQ" });
    expect(systemPrompt).toContain("runMinBookQuantAnalysis");
    expect(systemPrompt).toContain("## TL;DR");

    // Numbers matching user's uploaded Hyperprop MNQZ6 1m Pending Short Limit screenshot:
    // Current live spot 25,159.25; supply box 25,247.75-25,277.50 resting above; target 24,977.00; New Home Sales in 7m
    const quant = computeScreenshotQuantMetrics(
      {
        instrument: "MNQ",
        timeframe: "1m",
        screenshotCurrentPrice: 25159.25,
        direction: "SHORT",
        orderType: "LIMIT",
        positionStatus: "PLANNED_FLAT",
        entryZoneLow: 25247.75,
        entryZoneHigh: 25277.5,
        targetPrice: 24977.0,
        contracts: 1,
        accountBalance: 52048.88,
        openPnlDollars: 0,
        newsCountdownMinutes: 7,
        newsEventName: "New Home Sales",
        candleOpen: 25149.25,
        candleHigh: 25163.5,
        candleLow: 25132.0,
        candleClose: 25159.25,
      },
      snapshot
    );

    expect(quant.pointValueDollars).toBe(2);
    expect(quant.setupState).toBe("PENDING_LIMIT_ORDER");
    expect(quant.entryPrice).toBe(25262.63);
    expect(quant.stopLossSource).toBe("SUGGESTED_STRUCTURAL");
    expect(quant.stopLossPrice).toBeGreaterThan(25277.5);
    expect(quant.pullbackNeededToFillPts).toBe(103.38);
    expect(quant.limitSetupVerdict).not.toBe("INVALID");
    // Orange/medium New Home Sales should NOT veto a valid limit setup
    expect(quant.newsSeverity).toBe("ORANGE_MEDIUM");
    expect(quant.newsShouldVetoTrade).toBe(false);
    expect(quant.warnings.some((w) => w.includes("DO NOT CHASE THIS TRADE"))).toBe(false);
    expect(quant.warnings.some((w) => w.includes("missed"))).toBe(false);
    expect(quant.candleStats?.rangePts).toBe(31.5);

    // Tier-1 Red-folder news (CPI in 7m) SHOULD trigger veto
    const redNewsQuant = computeScreenshotQuantMetrics(
      {
        instrument: "MNQ",
        timeframe: "1m",
        screenshotCurrentPrice: 25159.25,
        direction: "SHORT",
        orderType: "LIMIT",
        positionStatus: "PLANNED_FLAT",
        entryPrice: 25277.5,
        stopLossPrice: 25333.25,
        targetPrice: 24977.0,
        contracts: 1,
        newsCountdownMinutes: 7,
        newsEventName: "CPI y/y",
      },
      snapshot
    );
    expect(redNewsQuant.newsSeverity).toBe("RED_HIGH");
    expect(redNewsQuant.newsShouldVetoTrade).toBe(true);
    expect(redNewsQuant.plannedRewardToRisk).toBe(5.39);
  });
});
