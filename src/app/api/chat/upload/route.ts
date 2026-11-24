import { NextRequest, NextResponse } from "next/server";
import { resolveChatUser } from "@/lib/chat/auth";
import { ensureChatThread, uploadChartScreenshot } from "@/lib/chat/store";

export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveChatUser();
    if (!auth.isAuthenticated) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Please sign in to upload chart screenshots" },
        { status: 401 }
      );
    }

    const contentType = request.headers.get("content-type") || "";
    let buffer: Buffer;
    let mimeType: string;
    let filename = "chart.png";
    let threadIdParam: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const rawThreadId = formData.get("threadId");
      if (typeof rawThreadId === "string" && rawThreadId.trim()) {
        threadIdParam = rawThreadId.trim();
      }

      if (!(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "Missing image file" },
          { status: 400 }
        );
      }

      mimeType = file.type.toLowerCase();
      filename = file.name || "chart.png";
      const arrayBuf = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuf);
    } else {
      const body = await request.json();
      const dataUrl = body?.dataUrl;
      if (typeof body?.threadId === "string" && body.threadId.trim()) {
        threadIdParam = body.threadId.trim();
      }
      if (typeof body?.filename === "string" && body.filename.trim()) {
        filename = body.filename.trim();
      }

      if (typeof dataUrl !== "string") {
        return NextResponse.json(
          { success: false, error: "Missing image dataUrl" },
          { status: 400 }
        );
      }

      const match = dataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/i);
      if (!match) {
        return NextResponse.json(
          { success: false, error: "Invalid image data URL" },
          { status: 400 }
        );
      }
      mimeType = match[1].toLowerCase();
      buffer = Buffer.from(match[2], "base64");
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: `Unsupported image type: ${mimeType}` },
        { status: 400 }
      );
    }

    if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { success: false, error: "Chart image must be between 1 byte and 10 MB" },
        { status: 400 }
      );
    }

    const thread = await ensureChatThread(threadIdParam, auth.userId);
    const uploaded = await uploadChartScreenshot({
      userId: auth.userId,
      threadId: thread.id,
      buffer,
      mimeType,
      originalFilename: filename,
    });

    return NextResponse.json({
      success: true,
      threadId: thread.id,
      storagePath: uploaded.storagePath,
      signedUrl: uploaded.signedUrl,
      mediaType: mimeType,
      filename,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to upload chart";
    console.error("API /api/chat/upload POST error:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
