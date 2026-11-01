import { useId, useState } from 'react';
import type { Observation } from '../../../packages/sim-engine/src';
import { InstrumentationWait } from './InstrumentationWait';

interface Props {
  view: Observation;
  busy: boolean;
  onInspect: () => void;
  onTerminate: (pid: number) => void;
}

export function DatabaseSessions({ view, busy, onInspect, onTerminate }: Props) {
  const feedbackId = useId();
  const [selectedPid, setSelectedPid] = useState<number | null>(null);
  if (!view.database) return null;
  const sessions = view.databaseSessions;
  const ended = view.status !== 'active';
  const selected = sessions?.find(session => session.pid === selectedPid);
  return <section className="panel">
    <div className="panel-heading"><h2>Métricas e sessões do banco</h2><span>POSTGRESQL · ESTADO ATUAL</span></div>
    <dl aria-label="Métricas do banco">
      <dt>Conexões ativas</dt><dd>{view.database.activeConnections}</dd>
      <dt>Idle in transaction</dt><dd>{view.database.idleInTransaction}</dd>
      <dt>Espera por lock</dt><dd>{view.database.lockWaitMs.toLocaleString('pt-BR')} ms</dd>
    </dl>
    <div className="session-investigation">
      <button className="primary" disabled={busy || ended} onClick={onInspect}>{sessions === null ? 'Consultar sessões' : 'Atualizar sessões'}</button>
    </div>
    {sessions !== null && <>
      <p className="database-caption">Amostra de sessões com usuário, referência de conexão, estado e última consulta no instante atual.</p>
      {sessions.length ? <div className="table-scroll"><table aria-label="Sessões do PostgreSQL">
        <thead><tr><th>PID / identidade</th><th>Estado / transação</th><th>Espera / bloqueador</th><th>Última consulta / ação</th></tr></thead>
        <tbody>{sessions.map(session => <tr key={session.pid}>
          <td><code>{session.pid}</code><small>{session.application} · {session.user}</small><small>Referência: {session.connectionTag}</small></td>
          <td>{session.state}<small>{session.transactionAge.toLocaleString('pt-BR')}s de transação</small></td>
          <td>{session.waitEvent}<small>{session.blockedBy === null ? 'Sem bloqueador' : `Bloqueada pelo PID ${session.blockedBy}`}</small></td>
          <td><code>{session.query}</code><button className="session-end" aria-describedby={view.instrumentation.pending ? `${feedbackId}-${session.pid}` : undefined} disabled={busy || ended || !!view.pending || !!view.instrumentation.pending} onClick={() => setSelectedPid(session.pid)}>Encerrar PID {session.pid}</button><InstrumentationWait id={`${feedbackId}-${session.pid}`} view={view} /></td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-copy">Nenhuma sessão disponível nesta amostra.</p>}
      {selected && !ended && <div className="session-confirmation" role="dialog" aria-label={`Encerrar sessão ${selected.pid}`}>
        <h3>Encerrar PID {selected.pid}?</h3>
        <p>A transação será desfeita em 30 segundos simulados. Encerrar um worker de compra pode abortar uma compra e provocar falhas durante 30 segundos de reconexão.</p>
        <button disabled={busy} onClick={() => setSelectedPid(null)}>Cancelar encerramento</button>
        <button className="primary" aria-describedby={view.instrumentation.pending ? `${feedbackId}-confirm` : undefined} disabled={busy || !!view.pending || !!view.instrumentation.pending} onClick={() => { onTerminate(selected.pid); setSelectedPid(null); }}>Confirmar encerramento do PID {selected.pid}</button>
        <InstrumentationWait id={`${feedbackId}-confirm`} view={view} />
      </div>}
      <div className="panel-footer">Amostra resumida; não representa todas as conexões do pool. Os detalhes consultados continuam disponíveis ao retomar a partida.</div>
    </>}
  </section>;
}
