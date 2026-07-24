import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 }
      );
    }

    let targetUrlStr = url.trim();
    if (!targetUrlStr.startsWith("http://") && !targetUrlStr.startsWith("https://")) {
      targetUrlStr = `https://${targetUrlStr}`;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(targetUrlStr);
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    const controller = new AbortController();
    // Increase timeout to 60 seconds to support Render cold boot spin-up times
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: {
          "User-Agent": "RenderKeepAlivePinger/1.0",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      return NextResponse.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText || (response.ok ? "OK" : "Error"),
        durationMs,
        timestamp: new Date().toISOString(),
        url: targetUrl.toString(),
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const errorMessage =
        err.name === "AbortError"
          ? "Request timed out after 60 seconds (Cold start took too long)"
          : err.message || "Failed to connect to host";

      return NextResponse.json({
        success: false,
        status: 0,
        statusText: "Connection Failed",
        durationMs,
        timestamp: new Date().toISOString(),
        url: targetUrl.toString(),
        error: errorMessage,
      });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({
      message: "Render Backend Keep-Alive API Endpoint",
      usage: "GET /api/ping?url=https://your-backend.onrender.com or POST /api/ping { url: '...' }",
    });
  }

  let targetUrlStr = url.trim();
  if (!targetUrlStr.startsWith("http://") && !targetUrlStr.startsWith("https://")) {
    targetUrlStr = `https://${targetUrlStr}`;
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(targetUrlStr, {
      method: "GET",
      headers: {
        "User-Agent": "RenderKeepAlivePinger/1.0",
        "Cache-Control": "no-cache",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText || (response.ok ? "OK" : "Error"),
      durationMs,
      timestamp: new Date().toISOString(),
      url: targetUrlStr,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    return NextResponse.json({
      success: false,
      status: 0,
      statusText: "Connection Failed",
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      url: targetUrlStr,
      error: err.name === "AbortError" ? "Timed out after 60 seconds" : err.message,
    });
  }
}
