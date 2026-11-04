import type { Client, Command, Snapshot } from './session';

export function createWorkerClient(): Client {
  const worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
  let sequence = 0;
  let closed = false;
  const pending = new Map<
    number,
    { resolve: (value: Snapshot) => void; reject: (error: Error) => void }
  >();
  worker.onmessage = (event: MessageEvent<{ id: number; snapshot: Snapshot; error?: string }>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error) request.reject(new Error(event.data.error));
    else request.resolve(event.data.snapshot);
  };
  worker.onerror = () => {
    for (const request of pending.values())
      request.reject(
        new Error('O motor de simulação parou. Recarregue para restaurar a partida salva.'),
      );
    pending.clear();
  };
  return {
    dispatch(command: Command) {
      if (closed) return Promise.reject(new Error('Simulação encerrada.'));
      return new Promise<Snapshot>((resolve, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, command });
      });
    },
    terminate() {
      closed = true;
      worker.terminate();
      for (const request of pending.values()) request.reject(new Error('Simulação encerrada.'));
      pending.clear();
    },
  };
}
