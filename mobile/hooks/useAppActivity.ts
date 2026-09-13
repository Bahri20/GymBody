import { useEffect } from 'react';
import { AppState } from 'react-native';
import axios from 'axios';

// Foreground presence, not proof of a completed workout or human interaction.
export default function useAppActivity(token: string | null, apiUrl: string) {
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    let pending = false;
    let lastSuccess = 0;
    const ping = async () => {
      if (AppState.currentState !== 'active' || pending || Date.now() - lastSuccess < 60000) return;
      pending = true;
      try {
        await axios.post(`${apiUrl}/activity`, {}, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
          timeout: 10000,
        });
        lastSuccess = Date.now();
      } catch {
        // Presence must not interrupt the app; retry on the next foreground tick.
      } finally { pending = false; }
    };
    void ping();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void ping();
    });
    const interval = setInterval(() => { void ping(); }, 60000);
    return () => {
      subscription.remove();
      clearInterval(interval);
      controller.abort();
    };
  }, [token, apiUrl]);
}
