import { TableSkeleton } from "./Skeleton.jsx";

export default function FailuresTable({ data }) {
  if (!data) return <TableSkeleton rows={5} />;

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 transition-colors">
        <h2 className="text-sm font-semibold mb-3">Recent Failures</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">No failures recorded.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 transition-colors overflow-x-auto">
      <h2 className="text-sm font-semibold mb-3">Recent Failures</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase text-gray-500 dark:text-gray-400">
            <th className="pb-2 pr-4">Recipient</th>
            <th className="pb-2 pr-4">Provider</th>
            <th className="pb-2 pr-4">Error</th>
            <th className="pb-2">Time</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
              <td className="py-2 pr-4 font-mono text-xs">{row.recipient}</td>
              <td className="py-2 pr-4 capitalize">{row.provider}</td>
              <td className="py-2 pr-4 max-w-[200px] truncate text-red-600 dark:text-red-400" title={row.error}>
                {row.error}
              </td>
              <td className="py-2 whitespace-nowrap text-gray-500 dark:text-gray-400">
                {new Date(row.created_at).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
