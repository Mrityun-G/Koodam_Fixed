import { useEffect, useState } from 'react';

// Seconds remaining until a timestamp, updated every second.
// Returns null when there is no timestamp.
export const useSecondsLeft = (until) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return undefined;

    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, [until]);

  if (!until) return null;

  return Math.max(0, Math.ceil((Number(until) - now) / 1000));
};
