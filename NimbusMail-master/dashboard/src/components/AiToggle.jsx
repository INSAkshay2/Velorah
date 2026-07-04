export default function AiToggle({ enabled, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="text-sm font-medium">AI personalisation</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          enabled ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </label>
  );
}
