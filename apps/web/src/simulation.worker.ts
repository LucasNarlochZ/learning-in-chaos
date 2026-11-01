import { EngineSession, type Command } from './session';

const session = new EngineSession();
self.onmessage = (event: MessageEvent<{ id: number; command: Command }>) => {
  const { id, command } = event.data;
  try {
    self.postMessage({ id, snapshot: session.execute(command) });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'Falha na simulação.' });
  }
};
