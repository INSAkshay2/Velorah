import { ChartSkeleton } from "./Skeleton.jsx";

const stateColor = {
  CLOSED: "bg-green-500",
  HALF_OPEN: "bg-yellow-500",
  OPEN: "bg-red-500",
};

const stateLabel = {
  CLOSED: "HEALTHY",
  HALF_OPEN: "DEGRADED",
  OPEN: "DEGRADED",
};

export default function ProviderHealth({ data }) {
  if (!data) return <ChartSkeleton />;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 transition-colors">
      <h2 className="text-sm font-semibold mb-3">Provider Health</h2>
      <div className="flex flex-wrap gap-3">
        {data.map(({ name, state, sentCount, failCount }) => (
          <div
            key={name}
            className="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3 min-w-[160px]"
          >
            <span className={`h-3 w-3 rounded-full ${stateColor[state] || "bg-gray-400"}`} />
            <div>
              <p className="text-sm font-medium capitalize">{name}</p>
              <p className={`text-xs font-semibold ${state === "CLOSED" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {stateLabel[state] || state}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {sentCount} sent / {failCount} failed
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
