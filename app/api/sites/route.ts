import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SITES_FILE = path.join(DATA_DIR, "sites.json");

async function readSites() {
  try {
    let raw = await readFile(SITES_FILE, "utf-8");
    // Strip UTF-8 BOM if present (PowerShell sometimes writes it)
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeSites(sites: unknown[]) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SITES_FILE, JSON.stringify(sites, null, 2), "utf-8");
}

export async function GET() {
  const sites = await readSites();
  return NextResponse.json(sites);
}

export async function POST(request: Request) {
  try {
    const sites = await request.json();
    if (!Array.isArray(sites)) {
      return NextResponse.json({ error: "Expected an array of sites" }, { status: 400 });
    }
    await writeSites(sites);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
