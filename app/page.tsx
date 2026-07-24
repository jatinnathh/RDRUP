"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Activity,
  Play,
  Pause,
  RefreshCw,
  Globe,
  Clock,
  CheckCircle2,
  XCircle,
  Trash2,
  Copy,
  Check,
  Zap,
  Server,
  Plus,
  Power,
  Terminal,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Sliders,
  Layers,
} from "lucide-react";

interface TargetSite {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastPingStatus?: number;
  lastPingTime?: string;
  lastLatencyMs?: number;
  lastSuccess?: boolean;
  lastError?: string;
  isPinging?: boolean;
}

interface PingLog {
  id: string;
  siteId: string;
  siteName: string;
  url: string;
  timestamp: string;
  status: number;
  statusText: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export default function Home() {
  const [sites, setSites] = useState<TargetSite[]>([]);
  const [newUrlInput, setNewUrlInput] = useState<string>("");
  const [newNameInput, setNewNameInput] = useState<string>("");
  const [intervalMinutes, setIntervalMinutes] = useState<number>(14);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [secondsLeft, setSecondsLeft] = useState<number>(14 * 60);
  const [logs, setLogs] = useState<PingLog[]>([]);
  const [selectedSiteFilter, setSelectedSiteFilter] = useState<string>("all");
  const [copiedWebhookId, setCopiedWebhookId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string>("");
  const [sitesLoading, setSitesLoading] = useState<boolean>(true);

  const sitesRef = useRef(sites);
  const isRunningRef = useRef(isRunning);
  const intervalMinutesRef = useRef(intervalMinutes);

  useEffect(() => {
    sitesRef.current = sites;
  }, [sites]);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    intervalMinutesRef.current = intervalMinutes;
  }, [intervalMinutes]);

  // Load sites from server-side JSON file on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }

    // Fetch sites from /api/sites (reads data/sites.json)
    fetch("/api/sites")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSites(data);
        }
      })
      .catch(() => {})
      .finally(() => setSitesLoading(false));

    // Logs remain in localStorage (display-only, not needed by cron)
    if (typeof window !== "undefined") {
      const savedLogs = localStorage.getItem("render_pinger_logs");
      if (savedLogs) {
        try {
          setLogs(JSON.parse(savedLogs));
        } catch {
          // fallback
        }
      }
    }
  }, []);

  // Save sites to server-side JSON file
  const saveSitesToStorage = useCallback((updatedSites: TargetSite[]) => {
    setSites(updatedSites);
    fetch("/api/sites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedSites),
    }).catch(() => {});
  }, []);

  // Ping a single site
  const pingSingleSite = useCallback(async (site: TargetSite) => {
    setSites((prev) =>
      prev.map((s) => (s.id === site.id ? { ...s, isPinging: true } : s))
    );

    try {
      const res = await fetch("/api/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: site.url }),
      });

      const data = await res.json();
      const timeStr = new Date().toLocaleTimeString();

      const newLog: PingLog = {
        id: Math.random().toString(36).substring(2, 9),
        siteId: site.id,
        siteName: site.name,
        url: site.url,
        timestamp: timeStr,
        status: data.status || 0,
        statusText: data.statusText || "Unknown",
        durationMs: data.durationMs || 0,
        success: !!data.success,
        error: data.error,
      };

      setLogs((prev) => {
        const updated = [newLog, ...prev].slice(0, 100);
        if (typeof window !== "undefined") {
          localStorage.setItem("render_pinger_logs", JSON.stringify(updated));
        }
        return updated;
      });

      setSites((prev) =>
        prev.map((s) =>
          s.id === site.id
            ? {
                ...s,
                isPinging: false,
                lastPingStatus: data.status || 0,
                lastPingTime: timeStr,
                lastLatencyMs: data.durationMs || 0,
                lastSuccess: !!data.success,
                lastError: data.error,
              }
            : s
        )
      );
    } catch (err: any) {
      const timeStr = new Date().toLocaleTimeString();
      const errorLog: PingLog = {
        id: Math.random().toString(36).substring(2, 9),
        siteId: site.id,
        siteName: site.name,
        url: site.url,
        timestamp: timeStr,
        status: 0,
        statusText: "Connection Error",
        durationMs: 0,
        success: false,
        error: err.message || "Failed to initiate ping",
      };

      setLogs((prev) => {
        const updated = [errorLog, ...prev].slice(0, 100);
        if (typeof window !== "undefined") {
          localStorage.setItem("render_pinger_logs", JSON.stringify(updated));
        }
        return updated;
      });

      setSites((prev) =>
        prev.map((s) =>
          s.id === site.id
            ? {
                ...s,
                isPinging: false,
                lastPingStatus: 0,
                lastPingTime: timeStr,
                lastLatencyMs: 0,
                lastSuccess: false,
                lastError: err.message || "Connection Error",
              }
            : s
        )
      );
    }
  }, []);

  // Ping all active sites
  const pingAllActiveSites = useCallback(() => {
    const activeList = sitesRef.current.filter((s) => s.enabled);
    activeList.forEach((site) => {
      pingSingleSite(site);
    });
  }, [pingSingleSite]);

  // Timer effect
  useEffect(() => {
    setSecondsLeft(intervalMinutes * 60);
  }, [intervalMinutes]);

  useEffect(() => {
    if (!isRunning) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          pingAllActiveSites();
          return intervalMinutesRef.current * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isRunning, pingAllActiveSites]);

  // Add new site handler
  const handleAddSite = (e: React.FormEvent) => {
    e.preventDefault();
    let cleanedUrl = newUrlInput.trim();
    if (!cleanedUrl) return;

    if (!cleanedUrl.startsWith("http://") && !cleanedUrl.startsWith("https://")) {
      cleanedUrl = `https://${cleanedUrl}`;
    }

    let siteName = newNameInput.trim();
    if (!siteName) {
      try {
        const parsed = new URL(cleanedUrl);
        siteName = parsed.hostname;
      } catch {
        siteName = cleanedUrl;
      }
    }

    const newSite: TargetSite = {
      id: Math.random().toString(36).substring(2, 9),
      name: siteName,
      url: cleanedUrl,
      enabled: true,
    };

    const updated = [...sites, newSite];
    saveSitesToStorage(updated);
    setNewUrlInput("");
    setNewNameInput("");

    // Trigger immediate ping for new site
    pingSingleSite(newSite);
  };

  // Toggle site enable/disable
  const handleToggleSite = (id: string) => {
    const updated = sites.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    saveSitesToStorage(updated);
  };

  // Remove site
  const handleRemoveSite = (id: string) => {
    const updated = sites.filter((s) => s.id !== id);
    saveSitesToStorage(updated);
  };

  // Clear logs
  const handleClearLogs = () => {
    setLogs([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("render_pinger_logs");
    }
  };

  const formatCountdown = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCopyWebhook = (siteUrl: string, siteId: string) => {
    const url = `${origin || "http://localhost:3000"}/api/ping?url=${encodeURIComponent(siteUrl)}`;
    navigator.clipboard.writeText(url);
    setCopiedWebhookId(siteId);
    setTimeout(() => setCopiedWebhookId(null), 2000);
  };

  const activeSites = sites.filter((s) => s.enabled);
  const successLogs = logs.filter((l) => l.success);
  const successRate = logs.length > 0 ? Math.round((successLogs.length / logs.length) * 100) : 100;
  const avgLatency =
    successLogs.length > 0
      ? Math.round(successLogs.reduce((acc, curr) => acc + curr.durationMs, 0) / successLogs.length)
      : 0;

  const totalSecForInterval = intervalMinutes * 60;
  const progressPercent = Math.max(0, Math.min(100, ((totalSecForInterval - secondsLeft) / totalSecForInterval) * 100));

  const filteredLogs =
    selectedSiteFilter === "all"
      ? logs
      : logs.filter((l) => l.siteId === selectedSiteFilter || l.url === selectedSiteFilter);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-100 tracking-tight flex items-center space-x-2">
                <span>Render Multi-Site Keep-Alive</span>
                <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 font-mono">
                  {sites.length} {sites.length === 1 ? "Site" : "Sites"}
                </span>
              </h1>
              <p className="text-xs text-zinc-400">Pings your backend services every 14 minutes</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                activeSites.length > 0 && isRunning
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                  activeSites.length > 0 && isRunning ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              {activeSites.length > 0
                ? isRunning
                  ? `Active (${activeSites.length} Pinging)`
                  : "Pinging Paused"
                : "No Active Sites"}
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Top Control Bar & Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Timer Card */}
          <div className="md:col-span-2 bg-zinc-900/70 border border-zinc-800 rounded-xl p-6 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Clock className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                    Next Automated Multi-Ping
                  </h2>
                </div>

                <div className="flex items-center space-x-1 bg-zinc-950 border border-zinc-800 rounded-lg p-1">
                  {[5, 10, 14].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => setIntervalMinutes(mins)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition cursor-pointer ${
                        intervalMinutes === mins
                          ? "bg-indigo-600 text-white"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Timer Display */}
              <div className="py-4 text-center">
                <div className="text-5xl font-mono font-bold tracking-tight text-white">
                  {formatCountdown(secondsLeft)}
                </div>
                <p className="text-xs text-zinc-400 mt-2">
                  {isRunning
                    ? `Pinging ${activeSites.length} active ${
                        activeSites.length === 1 ? "backend" : "backends"
                      } every ${intervalMinutes} minutes`
                    : "Interval timer paused"}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800/60 my-4">
                <div
                  className="bg-indigo-500 h-full transition-all duration-1000 ease-linear rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Interval Actions */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-zinc-800/80">
              <button
                onClick={() => setIsRunning(!isRunning)}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer ${
                  isRunning
                    ? "bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-amber-500/20"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                }`}
              >
                {isRunning ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause Timer</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Resume Timer</span>
                  </>
                )}
              </button>

              <button
                onClick={pingAllActiveSites}
                disabled={activeSites.length === 0}
                className="flex-1 flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Ping All Active Sites</span>
              </button>
            </div>
          </div>

          {/* Performance Overview */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-6 flex flex-col justify-between shadow-xl">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Zap className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                  Global Metrics
                </h3>
              </div>

              <div className="space-y-3">
                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-400">Total Sites Configured</div>
                    <div className="text-xl font-bold text-zinc-100 mt-0.5">{sites.length}</div>
                  </div>
                  <Server className="w-6 h-6 text-zinc-600" />
                </div>

                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-400">Overall Success Rate</div>
                    <div className="text-xl font-bold text-emerald-400 mt-0.5">
                      {logs.length === 0 ? "--" : `${successRate}%`}
                    </div>
                  </div>
                  <ShieldCheck className="w-6 h-6 text-emerald-500/50" />
                </div>

                <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-400">Avg Response Latency</div>
                    <div className="text-xl font-bold text-zinc-100 mt-0.5">
                      {logs.length === 0 || avgLatency === 0 ? "--" : `${avgLatency} ms`}
                    </div>
                  </div>
                  <Clock className="w-6 h-6 text-indigo-400/50" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add New Site Form Card */}
        <section className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-6 shadow-xl">
          <div className="flex items-center space-x-2 mb-4">
            <Plus className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Add New Backend Site
            </h2>
          </div>

          <form onSubmit={handleAddSite} className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-4">
              <input
                type="text"
                value={newNameInput}
                onChange={(e) => setNewNameInput(e.target.value)}
                placeholder="Site Name (e.g. Auth Service)"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
            <div className="md:col-span-6">
              <input
                type="text"
                value={newUrlInput}
                onChange={(e) => setNewUrlInput(e.target.value)}
                placeholder="https://your-backend.onrender.com"
                required
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Site</span>
              </button>
            </div>
          </form>
        </section>

        {/* Configured Sites List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Monitored Backend Sites ({sites.length})
              </h2>
            </div>
          </div>

          {sitesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i} className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 shadow-lg animate-pulse">
                  <div className="h-4 bg-zinc-800 rounded w-1/3 mb-3" />
                  <div className="h-3 bg-zinc-800 rounded w-2/3 mb-6" />
                  <div className="h-8 bg-zinc-800 rounded w-full" />
                </div>
              ))}
            </div>
          ) : sites.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center text-zinc-400">
              <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p>No backend sites added yet. Add a site above to begin keeping it alive.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className={`bg-zinc-900/80 border rounded-xl p-5 shadow-lg flex flex-col justify-between transition ${
                    site.enabled ? "border-zinc-800" : "border-zinc-800/40 opacity-60"
                  }`}
                >
                  <div>
                    {/* Header: Name + Enabled toggle */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-zinc-100 text-base flex items-center space-x-2">
                          <span>{site.name}</span>
                        </h3>
                        <a
                          href={site.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-indigo-400 hover:underline font-mono truncate max-w-xs block mt-0.5"
                        >
                          {site.url}
                        </a>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleToggleSite(site.id)}
                          className={`p-1.5 rounded-lg border transition cursor-pointer ${
                            site.enabled
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : "bg-zinc-800 border-zinc-700 text-zinc-500"
                          }`}
                          title={site.enabled ? "Disable Pinging" : "Enable Pinging"}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveSite(site.id)}
                          className="p-1.5 rounded-lg border border-zinc-800 hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 bg-zinc-950 transition cursor-pointer"
                          title="Delete Site"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Status Pill */}
                    <div className="mt-4 flex items-center justify-between text-xs border-t border-b border-zinc-800/60 py-2.5">
                      <span className="text-zinc-400">Status:</span>
                      {site.isPinging ? (
                        <span className="inline-flex items-center text-indigo-400 font-mono">
                          <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Pinging...
                        </span>
                      ) : site.lastPingStatus !== undefined ? (
                        <span
                          className={`inline-flex items-center font-mono font-medium ${
                            site.lastSuccess ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {site.lastSuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 mr-1 text-rose-400" />
                          )}
                          {site.lastPingStatus > 0 ? `HTTP ${site.lastPingStatus}` : "Failed"}
                          {site.lastLatencyMs ? ` (${site.lastLatencyMs} ms)` : ""}
                        </span>
                      ) : (
                        <span className="text-zinc-500 font-mono">Not pinged yet</span>
                      )}
                    </div>
                  </div>

                  {/* Footer Action Buttons */}
                  <div className="mt-4 flex items-center justify-between gap-2 pt-2">
                    <button
                      onClick={() => pingSingleSite(site)}
                      disabled={site.isPinging}
                      className="flex-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium py-2 px-3 rounded-lg flex items-center justify-center space-x-1.5 transition cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${site.isPinging ? "animate-spin" : ""}`}
                      />
                      <span>Ping Site</span>
                    </button>

                    <button
                      onClick={() => handleCopyWebhook(site.url, site.id)}
                      className="bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs py-2 px-3 rounded-lg flex items-center space-x-1 transition cursor-pointer"
                      title="Copy Webhook Endpoint for 24/7 External Cron"
                    >
                      {copiedWebhookId === site.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Webhook</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Global Ping Activity Log */}
        <section className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Multi-Site Activity Log
              </h3>
              <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
                {filteredLogs.length}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              {/* Site Filter dropdown */}
              <select
                value={selectedSiteFilter}
                onChange={(e) => setSelectedSiteFilter(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-300 px-3 py-1.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="all">All Sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {logs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="text-xs text-zinc-400 hover:text-rose-400 flex items-center space-x-1 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Log</span>
                </button>
              )}
            </div>
          </div>

          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
              <AlertCircle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-400">No pings logged yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950 text-zinc-400 uppercase font-mono border-b border-zinc-800">
                  <tr>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Site Name</th>
                    <th className="py-3 px-4">Target URL</th>
                    <th className="py-3 px-4">Latency</th>
                    <th className="py-3 px-4">Response Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-zinc-800/30 transition">
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            log.success
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {log.success ? (
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                          ) : (
                            <XCircle className="w-3 h-3 mr-1" />
                          )}
                          {log.status > 0 ? log.status : "FAIL"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-400">{log.timestamp}</td>
                      <td className="py-3 px-4 font-sans font-medium text-zinc-200">
                        {log.siteName || "Backend"}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 max-w-xs truncate">{log.url}</td>
                      <td className="py-3 px-4 text-zinc-300">
                        {log.durationMs > 0 ? `${log.durationMs} ms` : "--"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={log.success ? "text-zinc-400" : "text-rose-400 font-medium"}
                        >
                          {log.error || log.statusText}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
