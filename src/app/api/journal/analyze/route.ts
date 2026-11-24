import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Please sign in to analyze trade screenshots" },
        { status: 401 }
      );
    }
  }

  try {
    const body = await req.json();
    const { imageBase64 } = body || {};

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({
        success: true,
        mode: "CLIENT_OCR_ONLY",
        analysis: null
      });
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { success: false, error: "Missing imageBase64" },
        { status: 400 }
      );
    }

    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return NextResponse.json(
        { success: false, error: "Invalid base64 image payload" },
        { status: 400 }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Inspect this trading screenshot and find the green or red realized/open PnL overlay or box. Return ONLY valid JSON with keys: overlayColor ('GREEN' | 'RED' | 'UNKNOWN'), pnlDollars (signed number, negative if red/loss, positive if green/win, or null if not visible), rawText (exact text string of the PnL overlay), confidence ('HIGH' | 'MEDIUM' | 'LOW')."
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!geminiRes.ok) {
      return NextResponse.json({
        success: true,
        mode: "CLIENT_OCR_ONLY",
        analysis: null
      });
    }

    const geminiJson = await geminiRes.json();
    const textOut = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    let parsed: any = null;
    if (textOut) {
      try {
        parsed = JSON.parse(textOut);
      } catch {
        parsed = null;
      }
    }

    return NextResponse.json({
      success: true,
      mode: "GEMINI_VISION",
      analysis: parsed
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Failed to analyze screenshot" },
      { status: 500 }
    );
  }
}
