import { useState, useEffect } from "react";

export default function LastUpdated({ timestamp }) {
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    const tick = () => setAgo(Math.round((Date.now() - timestamp) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timestamp]);

  return (
    <p className="text-sm text-gray-500 dark:text-gray-400">
      Last updated {ago}s ago
    </p>
  );
}
