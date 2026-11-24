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
});
