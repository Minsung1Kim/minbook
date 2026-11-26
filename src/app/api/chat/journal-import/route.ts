import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import { resolveServerGeminiApiKey } from "@/lib/chat/key-store";
import {
  loadUserScalpJournalTrades,
  parseJournalCsvImport,
  parseJournalJsonImport,
  parseJournalPdfSlides,
  saveImportedJournalTrades,
} from "@/lib/chat/journal-ingest";
import { ScalpJournalTrade } from "@/types/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_JOURNAL_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

export async function GET() {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const trades = await loadUserScalpJournalTrades(auth.userId);
    const wins = trades.filter((t) => t.realizedR > 0).length;
    const overallWinRatePct =
      trades.length > 0 ? Math.round((wins / trades.length) * 1000) / 10 : 0;

    return NextResponse.json({
      success: true,
      totalTrades: trades.length,
      overallWinRatePct,
      recentTrades: trades.slice(0, 5),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load journal summary";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Sign in to import trade journal" },
        { status: 401 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let parsedTrades: ScalpJournalTrade[] = [];

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "Missing file field in form upload" },
          { status: 400 }
        );
      }

      if (file.size === 0 || file.size > MAX_JOURNAL_FILE_BYTES) {
        return NextResponse.json(
          { success: false, error: "Journal file must be between 1 byte and 25 MB" },
          { status: 400 }
        );
      }

      const fileName = (file.name || "").toLowerCase();
      const mimeType = (file.type || "").toLowerCase();

      if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) {
        const apiKey = await resolveServerGeminiApiKey(auth.userId);
        if (!apiKey) {
          return NextResponse.json(
            {
              success: false,
              error:
                "A Gemini API key is required to parse Google Slides PDFs. Add your key in the /chat bar first, or upload JSON/CSV.",
            },
            { status: 503 }
          );
        }
        const pdfBuffer = Buffer.from(await file.arrayBuffer());
        parsedTrades = await parseJournalPdfSlides({
          pdfBuffer,
          apiKey,
          userId: auth.userId,
        });
      } else if (mimeType.includes("json") || fileName.endsWith(".json")) {
        const text = await file.text();
        parsedTrades = parseJournalJsonImport(JSON.parse(text), auth.userId);
      } else if (mimeType.includes("csv") || fileName.endsWith(".csv")) {
        const text = await file.text();
        parsedTrades = parseJournalCsvImport(text, auth.userId);
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "Unsupported file format. Upload a .pdf (Google Slides), .json, or .csv file.",
          },
          { status: 400 }
        );
      }
    } else {
      const body = await request.json();
      if (typeof body?.csv === "string") {
        parsedTrades = parseJournalCsvImport(body.csv, auth.userId);
      } else {
        parsedTrades = parseJournalJsonImport(body?.trades ?? body, auth.userId);
      }
    }

    if (parsedTrades.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No valid trade entries could be extracted from the uploaded file.",
        },
        { status: 422 }
      );
    }

    const saved = await saveImportedJournalTrades(parsedTrades, auth.userId);
    const allTrades = await loadUserScalpJournalTrades(auth.userId);
    const wins = allTrades.filter((t) => t.realizedR > 0).length;

    return NextResponse.json({
      success: true,
      importedCount: saved.length,
      totalTrades: allTrades.length,
      overallWinRatePct:
        allTrades.length > 0 ? Math.round((wins / allTrades.length) * 1000) / 10 : 0,
      trades: saved,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to import trade journal";
    console.error("API /api/chat/journal-import POST error:", err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
