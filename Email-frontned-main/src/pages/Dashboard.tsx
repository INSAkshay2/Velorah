import { useState, useEffect, useCallback } from 'react';
import { Activity, Mail, Zap, ServerCrash, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Summary {
  jobs: { sent: number; failed: number; total: number; deliveryRate: number; pending: number; sending: number };
  queue: { waiting: number };
  circuitBreaker: { state: string; provider: string };
  aiPersonalisation: string;
}

interface HourlyPoint { hour: string; sent: number; failed: number }
interface ProvidersResp { primary: string; fallback: string; status: string }
interface FailureRow { id: number; recipientEmail: string; campaignName: string; error: string; failedAt: string }

function StatCard({ title, value, sub, icon: Icon, loading }: { title: string; value: string; sub?: string; icon: React.ElementType; loading: boolean }) {
  return (
    <div className="p-6 rounded-2xl border border-border/50 bg-secondary/10 backdrop-blur-md">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 rounded-lg bg-background/50 border border-border">
          <Icon className="w-5 h-5 text-foreground" />
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        </div>
      ) : (
        <>
          <h3 className="text-3xl font-light text-foreground mb-1">{value}</h3>
          {sub && <p className="text-sm text-muted-foreground">{title} &middot; <span className="text-foreground/70">{sub}</span></p>}
          {!sub && <p className="text-sm text-muted-foreground">{title}</p>}
        </>
      )}
    </div>
  );
}

const FETCH_INTERVAL = 5000;

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hourly, setHourly] = useState<HourlyPoint[]>([]);
  const [providers, setProviders] = useState<ProvidersResp | null>(null);
  const [failures, setFailures] = useState<FailureRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [s, h, p, f] = await Promise.all([
        fetch('/api/stats/summary').then(r => r.json()),
        fetch('/api/stats/hourly').then(r => r.json()),
        fetch('/api/stats/providers').then(r => r.json()),
        fetch('/api/stats/failures').then(r => r.json()),
      ]);
      setSummary(s);
      setHourly(h);
      setProviders(p);
      setFailures(f);
    } catch {
      // keep previous data on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, FETCH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAll]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 w-full flex-1">
      <div className="mb-12 animate-fade-rise">
        <h2 className="text-3xl text-foreground font-normal mb-2" style={{ fontFamily: "'Instrument Serif', serif" }}>
          Platform <em className="not-italic text-muted-foreground">Telemetry</em>
        </h2>
        <p className="text-muted-foreground text-sm">Real-time metrics from the production cluster.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 animate-fade-rise-delay">
        <StatCard title="Emails Sent" value={summary?.jobs.sent.toLocaleString() ?? '-'} sub={summary ? `pending ${summary.jobs.pending}` : undefined} icon={Mail} loading={loading} />
        <StatCard title="Failed" value={summary?.jobs.failed.toLocaleString() ?? '-'} sub={summary ? `${summary.jobs.deliveryRate}% delivery rate` : undefined} icon={AlertTriangle} loading={loading} />
        <StatCard title="Queue Depth" value={summary?.queue.waiting.toLocaleString() ?? '-'} sub="waiting jobs" icon={Zap} loading={loading} />
        <StatCard title="Circuit Breaker" value={summary?.circuitBreaker.state ?? '-'} sub={`provider: ${summary?.circuitBreaker.provider ?? '-'}`} icon={ServerCrash} loading={loading} />
      </div>

      {providers && (
        <div className="mb-12 animate-fade-rise-delay">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl border border-border/50 bg-secondary/10 backdrop-blur-md text-sm">
            <span className="text-muted-foreground">Provider:</span>
            <span className="font-medium text-foreground">{providers.primary}</span>
            {providers.status === 'failover' ? (
              <span className="inline-flex items-center gap-1 text-amber-400 text-xs font-medium">
                <ArrowUp className="w-3 h-3" /> failover
              </span>
            ) : providers.status === 'healthy' ? (
              <span className="inline-flex items-center gap-1 text-green-400 text-xs font-medium">
                <ArrowDown className="w-3 h-3" /> healthy
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                unconfigured
              </span>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12 animate-fade-rise-delay-2">
        <div className="lg:col-span-2 p-6 rounded-2xl border border-border/50 bg-secondary/10 backdrop-blur-md min-h-[300px] flex flex-col">
          <h3 className="text-lg font-medium text-foreground mb-6">Hourly Email Volume</h3>
          {loading ? (
            <div className="flex-1 bg-muted rounded animate-pulse" />
          ) : hourly.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">No data yet</div>
          ) : (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourly} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="hour" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v: string) => new Date(v).toLocaleTimeString([], { hour: '2-digit' })} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--secondary))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '13px' }}
                    labelFormatter={(v: string) => new Date(v).toLocaleString()}
                  />
                  <Line type="monotone" dataKey="sent" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Sent" />
                  <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} name="Failed" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="p-6 rounded-2xl border border-border/50 bg-secondary/10 backdrop-blur-md min-h-[300px]">
          <h3 className="text-lg font-medium text-foreground mb-6">AI &amp; Queue</h3>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 rounded-lg bg-background/30 border border-border/30">
                <span className="text-sm text-muted-foreground">AI Personalisation</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${summary?.aiPersonalisation === 'enabled' ? 'bg-green-500/10 text-green-400' : 'bg-muted text-muted-foreground'}`}>
                  {summary?.aiPersonalisation ?? 'unknown'}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-background/30 border border-border/30">
                <span className="text-sm text-muted-foreground">Queue Name</span>
                <span className="text-sm text-foreground font-mono">{summary?.queue.name ?? '-'}</span>
              </div>
              <div className="flex justify-between items-center p-3 rounded-lg bg-background/30 border border-border/30">
                <span className="text-sm text-muted-foreground">Circuit State</span>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${summary?.circuitBreaker.state === 'open' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                  {summary?.circuitBreaker.state ?? 'unknown'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="animate-fade-rise-delay-3">
        <h3 className="text-lg font-medium text-foreground mb-4">Recent Failures</h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-muted rounded animate-pulse" />)}
          </div>
        ) : failures.length === 0 ? (
          <div className="p-6 rounded-2xl border border-border/50 bg-secondary/10 backdrop-blur-md text-center text-sm text-muted-foreground">No failures</div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/50 bg-secondary/10 backdrop-blur-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left p-4 font-medium">Recipient</th>
                  <th className="text-left p-4 font-medium">Campaign</th>
                  <th className="text-left p-4 font-medium">Error</th>
                  <th className="text-right p-4 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {failures.map((row) => (
                  <tr key={row.id} className="border-b border-border/30 last:border-0 hover:bg-background/20 transition-colors">
                    <td className="p-4 text-foreground font-mono text-xs">{row.recipientEmail}</td>
                    <td className="p-4 text-foreground">{row.campaignName}</td>
                    <td className="p-4 text-red-400 text-xs max-w-[200px] truncate" title={row.error}>{row.error}</td>
                    <td className="p-4 text-right text-muted-foreground text-xs">{new Date(row.failedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
