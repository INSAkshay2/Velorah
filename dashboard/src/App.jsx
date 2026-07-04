import { useState, useEffect, useCallback, useRef } from "react";
import StatsCards from "./components/StatsCards.jsx";
import HourlyChart from "./components/HourlyChart.jsx";
import ProviderHealth from "./components/ProviderHealth.jsx";
import FailuresTable from "./components/FailuresTable.jsx";
import AiToggle from "./components/AiToggle.jsx";
import LastUpdated from "./components/LastUpdated.jsx";

export default function App() {
  const [summary, setSummary] = useState(null);
  const [hourly, setHourly] = useState(null);
  const [providers, setProviders] = useState(null);
  const [failures, setFailures] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [aiEnabled, setAiEnabled] = useState(
    () => document.cookie.includes("aiEnabled=true") ?? true,
  );
  const mountedRef = useRef(true);

  const fetchJson = useCallback(async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const d = await fetchJson("/api/stats/summary");
      if (mountedRef.current) setSummary(d);
    } catch (_) {}
  }, [fetchJson]);

  const fetchHourly = useCallback(async () => {
    try {
      const d = await fetchJson("/api/stats/hourly");
      if (mountedRef.current) setHourly(d);
    } catch (_) {}
  }, [fetchJson]);

  const fetchProviders = useCallback(async () => {
    try {
      const d = await fetchJson("/api/stats/providers");
      if (mountedRef.current) setProviders(d);
    } catch (_) {}
  }, [fetchJson]);

  const fetchFailures = useCallback(async () => {
    try {
      const d = await fetchJson("/api/stats/failures");
      if (mountedRef.current) setFailures(d);
    } catch (_) {}
  }, [fetchJson]);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchSummary(),
      fetchHourly(),
      fetchProviders(),
      fetchFailures(),
    ]);
    if (mountedRef.current) setLastUpdated(Date.now());
  }, [fetchSummary, fetchHourly, fetchProviders, fetchFailures]);

  useEffect(() => {
    refresh();
    const fast = setInterval(refresh, 5000);
    const slow = setInterval(fetchHourly, 30000);
    return () => {
      mountedRef.current = false;
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [refresh, fetchHourly]);

  const toggleAi = async (enabled) => {
    await fetch("/api/settings/ai", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setAiEnabled(enabled);
    document.cookie = `aiEnabled=${enabled}; path=/; max-age=86400`;
  };

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Email Dashboard</h1>
          <LastUpdated timestamp={lastUpdated} />
        </div>
        <AiToggle enabled={aiEnabled} onChange={toggleAi} />
      </header>

      <StatsCards data={summary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <HourlyChart data={hourly} />
        <ProviderHealth data={providers} />
      </div>

      <div className="mt-6">
        <FailuresTable data={failures} />
      </div>
    </div>
  );
}
