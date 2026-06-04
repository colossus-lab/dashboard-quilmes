import { useCallback, useEffect, useState } from 'react';

// ═══════════════════════════════════════════════════════════════════
// useFirstVisit — true solo la primera vez que el navegador abre el
// dashboard (flag persistido en localStorage bajo `quilmes-intro-seen`).
// ═══════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'quilmes-intro-seen';

export function useFirstVisit() {
  const [isFirst, setIsFirst] = useState(false);

  useEffect(() => {
    try {
      const seen = localStorage.getItem(STORAGE_KEY);
      if (!seen) setIsFirst(true);
    } catch {
      // Si localStorage está bloqueado, no mostramos el intro (menos
      // intrusivo que mostrarlo en cada carga).
    }
  }, []);

  const dismiss = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    setIsFirst(false);
  }, []);

  return { isFirst, dismiss };
}
