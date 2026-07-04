import { CardSkeleton } from "./Skeleton.jsx";

const cards = [
  { label: "Total Sent", key: "totalSent", fmt: (v) => v?.toLocaleString() ?? "—" },
  { label: "Delivery Rate", key: "deliveryRate", fmt: (v) => (v != null ? `${v}%` : "—") },
  { label: "Failed", key: "failed", fmt: (v) => v?.toLocaleString() ?? "—" },
  { label: "Queue Depth", key: "queueDepth", fmt: (v) => v?.toLocaleString() ?? "—" },
];

export default function StatsCards({ data }) {
  if (!data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map(({ label, key, fmt }) => (
        <div
          key={key}
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 transition-colors"
        >
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {label}
          </p>
          <p className="text-2xl font-bold mt-1">{fmt(data[key])}</p>
        </div>
      ))}
    </div>
  );
}
