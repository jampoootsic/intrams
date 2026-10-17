import { useEffect, useRef } from 'react';
import { api } from '../api.js';

const ERROR_INTERVAL = 5000;

// Polls the server's data-version token and calls `reload()` when it changes.
export function useLiveRefresh(reload, { interval = 2000, enabled = true } = {}) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!enabled) return undefined;

    let stopped = false;
    let timer = null;
    let lastVersion = null;
    let failed = false;
    let inFlight = false;

    const visible = () => document.visibilityState === 'visible';

    const schedule = () => {
      clearTimeout(timer);
      if (stopped || !visible()) return;
      timer = setTimeout(tick, failed ? Math.max(interval, ERROR_INTERVAL) : interval);
    };

    const tick = async () => {
      clearTimeout(timer);
      if (stopped || inFlight || !visible()) return;
      inFlight = true;
      try {
        const res = await api('/settings/version');
        if (stopped) return;
        failed = false;
        const v = res && res.version;
        if (lastVersion === null) {
          lastVersion = v;
        } else if (v !== lastVersion) {
          lastVersion = v;
          try {
            await reloadRef.current();
          } catch {
            /* reload errors are handled by the caller */
          }
        }
      } catch {
        failed = true;
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const onVisibility = () => {
      if (visible()) tick();
      else clearTimeout(timer);
    };

    document.addEventListener('visibilitychange', onVisibility);
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [interval, enabled]);
}

export default useLiveRefresh;
