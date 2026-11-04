import { instruments } from '../../../packages/educational-content/src';
import type { Observation } from '../../../packages/sim-engine/src';

interface Props {
  id: string;
  view: Observation;
}

export function InstrumentationWait({ id, view }: Props) {
  const pending = view.instrumentation.pending;
  if (!pending) return null;
  const name = instruments.find((item) => item.id === pending.metric)?.name;
  return (
    <p id={id} className="instrumentation-wait">
      Aguarde a instrumentação atual: {name} ({Math.max(0, pending.completesAt - view.elapsed)}s
      simulados restantes). Continue ou avance o tempo para concluir.
    </p>
  );
}
