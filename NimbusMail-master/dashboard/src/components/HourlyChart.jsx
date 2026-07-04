import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { ChartSkeleton } from "./Skeleton.jsx";

function formatHour(hourStr) {
  const d = new Date(hourStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function HourlyChart({ data }) {
  if (!data) return <ChartSkeleton />;

  const chartData = data.map((r) => ({ ...r, label: formatHour(r.hour) }));

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 transition-colors">
      <h2 className="text-sm font-semibold mb-3">Emails Sent (Last 24h)</h2>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="fillSent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="currentColor"
            className="stroke-gray-200 dark:stroke-gray-700"
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="text-gray-500 dark:text-gray-400"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            className="text-gray-500 dark:text-gray-400"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--tooltip-bg, #fff)",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#fillSent)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
