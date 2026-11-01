type AnalyticsEvent = { name: string; elapsedSeconds: number; properties: Record<string, string | number | boolean | null> };

const endpoint = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_ANALYTICS_URL ?? 'http://127.0.0.1:3001/api';
const pendingKey = 'learning-in-chaos.analytics.pending.v1';
const finishKey = 'learning-in-chaos.analytics.finishes.v1';

function pending() {
  try { return JSON.parse(localStorage.getItem(pendingKey) ?? '{}') as Record<string, AnalyticsEvent[]>; }
  catch { return {} as Record<string, AnalyticsEvent[]>; }
}

export class AnalyticsClient {
  private readonly queue: AnalyticsEvent[] = [];
  private flushing = false;

  constructor(readonly sessionId: string) {
    this.queue.push(...(pending()[sessionId] ?? []));
    window.addEventListener('online', this.flush);
    window.addEventListener('online', this.flushFinishes);
    void this.flush();
    void this.flushFinishes();
  }

  track(name: string, elapsedSeconds: number, properties: AnalyticsEvent['properties'] = {}) {
    this.queue.push({ name, elapsedSeconds, properties });
    this.persist();
    if (this.queue.length >= 20) void this.flush();
  }

  async finish(durationMs: number, simulatedSeconds: number, status: 'resolved' | 'ended') {
    await this.flush();
    const finish = { durationMs, simulatedSeconds, status };
    try {
      const response = await fetch(`${endpoint}/sessions/${this.sessionId}/finish`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(finish), keepalive: true,
      });
      if (!response.ok) this.persistFinish(finish);
    } catch { this.persistFinish(finish); }
    window.removeEventListener('online', this.flush);
    window.removeEventListener('online', this.flushFinishes);
  }

  private persistFinish(finish: { durationMs: number; simulatedSeconds: number; status: 'resolved' | 'ended' }) {
    try {
      const values = JSON.parse(localStorage.getItem(finishKey) ?? '{}') as Record<string, typeof finish>;
      values[this.sessionId] = finish;
      localStorage.setItem(finishKey, JSON.stringify(values));
    } catch { /* Analytics must not interrupt gameplay. */ }
  }

  private flushFinishes = async () => {
    let values: Record<string, { durationMs: number; simulatedSeconds: number; status: 'resolved' | 'ended' }>;
    try { values = JSON.parse(localStorage.getItem(finishKey) ?? '{}'); }
    catch { return; }
    for (const [id, finish] of Object.entries(values)) {
      try {
        const response = await fetch(`${endpoint}/sessions/${id}/finish`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(finish) });
        if (response.ok) delete values[id];
      } catch { break; }
    }
    try { localStorage.setItem(finishKey, JSON.stringify(values)); } catch { /* Ignore unavailable storage. */ }
  };

  private flush = async () => {
    if (this.flushing || !this.queue.length) return;
    this.flushing = true;
    const batch = this.queue.splice(0, 100);
    try {
      const response = await fetch(`${endpoint}/sessions/${this.sessionId}/events`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: batch }), keepalive: true,
      });
      if (!response.ok) this.queue.unshift(...batch);
    } catch { this.queue.unshift(...batch); }
    finally { this.flushing = false; this.persist(); }
  };

  private persist() {
    try {
      const stored = pending();
      if (this.queue.length) stored[this.sessionId] = this.queue.slice(-500);
      else delete stored[this.sessionId];
      localStorage.setItem(pendingKey, JSON.stringify(stored));
    } catch { /* Analytics must not interrupt gameplay. */ }
  }
}

export async function createAnalyticsSession(input: { scenarioId: string; scenarioVersion: string; difficulty: 'guided' | 'free'; seed: number; engineVersion: string }) {
  try {
    const response = await fetch(`${endpoint}/sessions`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const data = await response.json() as { id: string };
    return new AnalyticsClient(data.id);
  } catch { return null; }
}
