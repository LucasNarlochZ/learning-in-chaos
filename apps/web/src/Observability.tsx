import { instruments, type InstrumentId } from '../../../packages/educational-content/src';
import type { Observation } from '../../../packages/sim-engine/src';

interface Props {
  view: Observation;
  disabled: boolean;
  onConfigure: (metric: InstrumentId, enabled: boolean) => void;
}

export function Observability({ view, disabled, onConfigure }: Props) {
  const { enabled, pending, overhead } = view.instrumentation;
  const blocked = disabled || !!view.pending || !!pending;
  return <>
    <section className="panel telemetry-budget" aria-label="Overhead da instrumentação">
      <div className="panel-heading"><h2>Custo de observar</h2><span>{enabled.length} COLETAS ATIVAS</span></div>
      <dl><dt>Carga adicional no banco</dt><dd>{overhead.databaseWork} unidades/s</dd><dt>Latência adicionada por requisição</dt><dd>{overhead.latency} ms</dd><dt>Coleta e armazenamento</dt><dd>US$ {overhead.hourlyCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h</dd></dl>
      <p className="panel-footer">Os custos são cumulativos e já afetam o dashboard. Desativar uma coleta remove seu overhead. A instalação leva 60s simulados; os sinais passam a ser coletados quando ela termina.</p>
    </section>
    <div className="telemetry-grid">{instruments.filter(item => item.id !== 'checkout-dimensions' || view.actionTargets['optimize-query'].some(query => query.id === 'checkout-pricing')).map(item => {
      const active = enabled.includes(item.id);
      const installing = pending?.metric === item.id;
      return <section className={`panel telemetry-card ${active ? 'collecting' : ''}`} key={item.id}>
        <div className="eyebrow">{active ? 'COLETA ATIVA' : installing ? 'IMPLEMENTANDO' : 'NÃO INSTRUMENTADO'}</div>
        <h2>{item.name}</h2><p>{item.description}</p>
        <ul><li>+{item.databaseWork} unidades/s no banco</li><li>+{item.latency} ms por requisição</li><li>+US$ {item.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/h</li></ul>
        <button className={active ? '' : 'primary'} disabled={blocked} onClick={() => onConfigure(item.id, !active)}>{active ? 'Desativar' : 'Implementar'} {item.name}</button>
      </section>;
    })}</div>
  </>;
}
