import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITES_FILE = path.join(process.cwd(), "data", "sites.json");

interface Site {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

async function readSites(): Promise<Site[]> {
  try {
    let raw = await readFile(SITES_FILE, "utf-8");
    // Strip UTF-8 BOM if present
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function pingUrl(site: Site) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);

  try {
    const response = await fetch(site.url, {
      method: "GET",
      headers: {
        "User-Agent": "RenderKeepAlivePinger/1.0 (Cron)",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return {
      id: site.id,
      name: site.name,
      url: site.url,
      success: response.ok,
      status: response.status,
      statusText: response.statusText || (response.ok ? "OK" : "Error"),
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      id: site.id,
      name: site.name,
      url: site.url,
      success: false,
      status: 0,
      statusText: "Connection Failed",
      durationMs: Date.now() - startTime,
      error:
        err.name === "AbortError"
          ? "Timed out after 55s (Render cold start)"
          : err.message || "Unknown error",
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const customUrls = searchParams.get("urls") || searchParams.get("url");
  let activeSites: Site[] = [];

  if (customUrls) {
    const urlsArr = customUrls.split(",").map((u) => u.trim()).filter(Boolean);
    activeSites = urlsArr.map((url, i) => {
      let targetUrl = url;
      if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
        targetUrl = `https://${targetUrl}`;
      }
      return {
        id: `custom-${i}`,
        name: new URL(targetUrl).hostname,
        url: targetUrl,
        enabled: true,
      };
    });
  } else {
    const allSites = await readSites();
    activeSites = allSites.filter((s) => s.enabled);
  }

  if (activeSites.length === 0) {
    return NextResponse.json({
      success: true,
      message: "No active sites to ping. Add sites to data/sites.json or pass ?urls=https://your-site.onrender.com",
      timestamp: new Date().toISOString(),
      pinged: 0,
      results: [],
    });
  }

  // Ping all active sites concurrently
  const results = await Promise.all(activeSites.map(pingUrl));
  const timestamp = new Date().toISOString();

  console.log(`[Cron] ${timestamp} — Pinged ${results.length} site(s):`, results);

  return NextResponse.json({
    success: results.every((r) => r.success),
    timestamp,
    pinged: results.length,
    results,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
