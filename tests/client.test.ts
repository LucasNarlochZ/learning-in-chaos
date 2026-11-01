import { afterEach, expect, it, vi } from 'vitest';
import { createWorkerClient } from '../apps/web/src/client';
import { EngineSession, type Command } from '../apps/web/src/session';

afterEach(() => vi.unstubAllGlobals());

it('rejects commands after worker cleanup instead of leaving the interface waiting forever', async () => {
  vi.stubGlobal('Worker', class {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror = null;
    private session = new EngineSession();
    private stopped = false;
    postMessage({ id, command }: { id: number; command: Command }) {
      if (this.stopped) return;
      queueMicrotask(() => this.onmessage?.({ data: { id, snapshot: this.session.execute(command) } }));
    }
    terminate() { this.stopped = true; }
  });
  const client = createWorkerClient();
  await client.dispatch({ type: 'start', seed: 42, difficulty: 'guided' });
  client.terminate();
  const result = await Promise.race([
    client.dispatch({ type: 'tick', seconds: 1 }).then(() => 'Unexpected response', error => error.message),
    new Promise(resolve => setTimeout(() => resolve('Worker did not respond'), 50)),
  ]);
  client.terminate();
  expect(result).toBe('Simulação encerrada.');
});
