import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ENGINE_VERSION } from '../../../packages/sim-engine/src';
import {
  interventions,
  availableActions,
  instruments,
  type ActionId,
  type Difficulty,
} from '../../../packages/educational-content/src';
import type { Entry, Observation } from '../../../packages/sim-engine/src';
import { createWorkerClient } from './client';
import { ApplicationPanel } from './ApplicationPanel';
import { DatabaseSessions } from './DatabaseSessions';
import { CheckoutBreakdown } from './CheckoutBreakdown';
import { Observability } from './Observability';
import { InterventionTools } from './InterventionTools';
import { InterventionReview } from './InterventionReview';
import { getScenario, scenarioCatalog } from '../../../packages/scenarios/src';
import type { Client, Command, Snapshot } from './session';
import { createAnalyticsSession, type AnalyticsClient } from './analytics';
import { FeedbackForm } from './FeedbackForm';

const STORAGE_KEY = 'learning-in-chaos.run.v1';
const tabs = [
  'Overview',
  'Endpoints',
  'Application',
  'Logs',
  'Deploys',
  'Customer messages',
  'Alerts',
  'Architecture',
  'Observability',
] as const;
type Tab = (typeof tabs)[number];
const tabLabels: Record<Tab, string> = {
  Observability: 'Observabilidade',
  Overview: 'Dashboard',
  Endpoints: 'Endpoints',
  Application: 'Aplicação',
  Logs: 'Logs',
  Deploys: 'Deploys',
  'Customer messages': 'Mensagens de clientes',
  Alerts: 'Alertas',
  Architecture: 'Arquitetura',
};
const tabDescriptions: Record<Tab, string> = {
  Observability: 'Implemente os sinais necessários. Observe também o custo da coleta.',
  Overview: 'Acompanhe a saúde dos componentes e os indicadores operacionais.',
  Endpoints: 'Cada requisição conta uma história. Compare os endpoints.',
  Application: 'Inspecione as consultas de cada endpoint. Busque um plano e acompanhe o trabalho.',
  Logs: 'Leia o que o sistema está dizendo. Busque por endpoint, plano de execução ou severidade.',
  Deploys: 'Investigue versões implantadas e sua relação com o início dos sintomas.',
  'Customer messages': 'Entenda o impacto percebido por quem utiliza o sistema.',
  Alerts: 'Acompanhe os sinais operacionais e os eventos de recuperação.',
  Architecture: 'Um sistema compartilhado. Cada mudança tem consequências.',
};
const eventLabels: Record<string, string> = {
  baseline: 'Referência',
  deploy: 'Deploy',
  job: 'Job',
  alert: 'Alerta',
  customer: 'Cliente',
  action: 'Intervenção',
  complete: 'Conclusão',
  recovered: 'Recuperação',
  ended: 'Encerramento',
};
const symbols = ['◫', '⇄', '⌘', '≡', '◷', '☏', '△', '◇', '⌁'];
const clock = (seconds: number) =>
  `${seconds < 0 ? '−' : ''}${String(Math.floor(Math.abs(seconds) / 60)).padStart(2, '0')}:${String(Math.abs(seconds) % 60).padStart(2, '0')}`;

function Brand() {
  return (
    <a className="brand" href="/" aria-label="Learning in Chaos — início">
      <span className="brand-mark" aria-hidden="true">
        ⌁
      </span>
      <span>
        learning<span className="brand-in"> in </span>chaos<span className="brand-dot">.</span>
      </span>
    </a>
  );
}

function Chart({
  history,
  metric,
  color,
  label,
  threshold,
}: {
  history: Observation['history'];
  metric: 'latency' | 'errors' | 'database';
  color: string;
  label: string;
  threshold?: number;
}) {
  const values = history.slice(-120);
  const max = Math.max(threshold ?? 0, ...values.map((p) => p[metric]), 1) * 1.18;
  const y = (v: number) => 108 - (v / max) * 94;
  const points = values.map(
    (point, i) => `${(i / Math.max(1, values.length - 1)) * 480},${y(point[metric])}`,
  );
  if (points.length === 1) points.push(`480,${y(values[0][metric])}`);
  return (
    <svg
      className="chart"
      viewBox="0 0 480 128"
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {[22, 64, 106].map((row) => (
        <line key={row} x1="0" x2="480" y1={row} y2={row} className="chart-grid" />
      ))}
      {threshold !== undefined && (
        <line x1="0" x2="480" y1={y(threshold)} y2={y(threshold)} className="chart-threshold" />
      )}
      <polygon points={`0,118 ${points.join(' ')} 480,118`} fill={color} opacity="0.07" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Timeline({ entries }: { entries: Entry[] }) {
  return (
    <ol className="timeline">
      {[...entries].reverse().map((entry, i) => (
        <li key={`${entry.at}-${i}`}>
          <time>{clock(entry.at)}</time>
          <span className={`event-dot ${entry.kind}`} />
          <div>
            <span className="event-kind">{eventLabels[entry.kind] ?? entry.kind}</span>
            <p>{entry.message}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function SignalSection({
  entries,
  channel,
}: {
  entries: Entry[];
  channel: 'Deploys' | 'Customer messages' | 'Alerts';
}) {
  const channels = {
    Deploys: {
      title: 'Histórico de deploys',
      kinds: ['deploy'],
      empty: 'Nenhum deploy registrado neste incidente.',
    },
    'Customer messages': {
      title: 'Mensagens de clientes',
      kinds: ['customer'],
      empty: 'Nenhuma mensagem de cliente recebida neste incidente.',
    },
    Alerts: {
      title: 'Alertas do sistema',
      kinds: ['alert', 'recovered'],
      empty: 'Nenhum alerta registrado neste incidente.',
    },
  };
  const config = channels[channel];
  const visible = entries.filter((entry) => config.kinds.includes(entry.kind));
  return (
    <section className="panel" role="region" aria-label={config.title}>
      <div className="panel-heading">
        <h2>{config.title}</h2>
        <span>
          {visible.length} registro{visible.length === 1 ? '' : 's'}
        </span>
      </div>
      {visible.length ? (
        <Timeline entries={visible} />
      ) : (
        <p className="empty-copy">{config.empty}</p>
      )}
      <div className="panel-footer">
        Tempos relativos ao início do plantão. Valores negativos indicam eventos anteriores à sua
        chegada.
      </div>
    </section>
  );
}

function Topology({ view, expanded = false }: { view: Observation; expanded?: boolean }) {
  const metrics = view.metrics;
  return (
    <div className={`topology ${expanded ? 'expanded' : ''}`}>
      <div className="flow-line" aria-hidden="true" />
      <div className="topology-node">
        <span className="node-icon">◎</span>
        <strong>Clientes</strong>
        <span>{metrics.rps} req/s</span>
        <small>Loja virtual</small>
      </div>
      <span className="flow-arrow" aria-hidden="true">
        →
      </span>
      <div className="topology-node">
        <span className="node-icon">⌘</span>
        <strong>
          REST API <i className="healthy-dot" />
        </strong>
        <span>
          {metrics.apiUtilization.toLocaleString('pt-BR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
          % CPU
        </span>
        <small>
          {view.topology.apiInstances} instância{view.topology.apiInstances > 1 ? 's' : ''}
        </small>
      </div>
      <span className="flow-arrow" aria-hidden="true">
        →
      </span>
      <div
        className={`topology-node ${metrics.databaseUtilization > 85 || metrics.connections >= view.topology.pool * 0.85 ? 'node-warning' : ''}`}
      >
        <span className="node-icon">▱</span>
        <strong>
          PostgreSQL{' '}
          <i
            className={
              metrics.databaseUtilization > 85 || metrics.connections >= view.topology.pool * 0.85
                ? 'warning-dot'
                : 'healthy-dot'
            }
          />
        </strong>
        <span>
          {metrics.databaseUtilization.toLocaleString('pt-BR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}
          % de utilização
        </span>
        <small>
          {metrics.connections}/{view.topology.pool} conexões
        </small>
      </div>
      {(view.topology.cache || view.topology.caches.length > 0 || view.topology.replica) && (
        <div className="topology-additions">
          {view.topology.cache && (
            <span>
              ◇ Cache de catálogo · TTL de 60s ·{' '}
              {Math.round(view.topology.catalogCacheHitRate * 100)}% de acertos estimados
            </span>
          )}
          {view.topology.caches.map((cache) => (
            <span key={cache.endpoint}>
              ◇ Cache · {cache.endpoint} · {Math.round(cache.hitRate * 100)}% de acertos
            </span>
          ))}
          {view.topology.replica && <span>▱ Réplica de leitura · catálogo e pedidos</span>}
        </div>
      )}
    </div>
  );
}

function Metric({
  title,
  value,
  unit,
  state,
  children,
}: {
  title: string;
  value: string;
  unit: string;
  state?: 'bad' | 'good';
  children: ReactNode;
}) {
  return (
    <section className="metric">
      <span className="metric-title">{title}</span>
      <div className={`metric-number ${state ?? ''}`}>
        {value}
        <span>{unit}</span>
      </div>
      <div className="metric-foot">{children}</div>
    </section>
  );
}

function TelemetryGap({ title, onConfigure }: { title: string; onConfigure: () => void }) {
  return (
    <section className="panel telemetry-gap">
      <div>
        <span className="eyebrow">COLETA NÃO IMPLEMENTADA</span>
        <h2>{title}</h2>
        <p>Escolha a instrumentação em Observabilidade e avalie o overhead antes de ativar.</p>
      </div>
      <button onClick={onConfigure}>Configurar instrumentação →</button>
    </section>
  );
}

function hasInvestigationTools(snapshot: Snapshot) {
  const view = snapshot.observation;
  const review = snapshot.report;
  const hasReview =
    !review ||
    (!!review.finalMetrics &&
      Array.isArray(review.inferences) &&
      review.inferences.every(
        (inference) => 'followUp' in inference && typeof inference.before.queue === 'number',
      ));
  return (
    hasReview &&
    'database' in view &&
    !!view.instrumentation &&
    !!view.actionTargets &&
    Array.isArray(view.checkoutBreakdown) &&
    view.endpoints.length > 0 &&
    view.endpoints.every(
      (endpoint) =>
        Array.isArray(endpoint.queries) &&
        endpoint.queries.length > 0 &&
        typeof endpoint.errorRate === 'number',
    )
  );
}

export function App({ client: providedClient }: { client?: Client }) {
  const client = useRef<Client | null>(providedClient ?? null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<Difficulty>('guided');
  const [seed, setSeed] = useState('42');
  const [scenarioId, setScenarioId] = useState(scenarioCatalog[0].id);
  const [scenarioFilter, setScenarioFilter] = useState('Todos');
  const [tab, setTab] = useState<Tab>('Overview');
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const [selectedAction, setSelectedAction] = useState<ActionId | null>(null);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('ALL');
  const [showReport, setShowReport] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [sessionNavigation, setSessionNavigation] = useState(0);
  const databasePanel = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const analytics = useRef<AnalyticsClient | null>(null);
  const sessionStartedAt = useRef<number | null>(null);
  const previousElapsed = useRef(0);
  const previousSpeed = useRef(1);
  const previousPaused = useRef(true);

  useEffect(
    () => () => {
      if (!providedClient) {
        client.current?.terminate();
        client.current = null;
      }
    },
    [providedClient],
  );

  async function send(command: Command) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      if (!client.current) {
        client.current = createWorkerClient();
        if (snapshot && command.type !== 'start' && command.type !== 'restore') {
          await client.current.dispatch({ type: 'restore', json: JSON.stringify(snapshot.record) });
        }
      }
      let next = await client.current.dispatch(command);
      if (!hasInvestigationTools(next)) {
        if (!providedClient) {
          client.current.terminate();
          client.current = createWorkerClient();
        }
        next = await client.current.dispatch({
          type: 'restore',
          json: JSON.stringify(next.record),
        });
        if (!hasInvestigationTools(next))
          throw new Error(
            'Não foi possível atualizar as ferramentas da aplicação. Recarregue a página para retomar sua investigação.',
          );
      }
      setSnapshot(next);
      setMode(next.record.difficulty);
      setScenarioId(next.record.scenarioId);
      try {
        const json = JSON.stringify(next.record);
        localStorage.setItem(STORAGE_KEY, json);
        setSaved(json);
      } catch {
        setStorageError(
          'O armazenamento do navegador está indisponível. Mantenha esta aba aberta; o progresso não será preservado ao recarregar.',
        );
      }
      if (next.observation.status !== 'active') setPaused(true);
      if (command.type === 'start') {
        sessionStartedAt.current = Date.now();
        previousElapsed.current = 0;
        analytics.current = await createAnalyticsSession({
          scenarioId: next.record.scenarioId,
          scenarioVersion: next.record.scenarioVersion,
          difficulty: next.record.difficulty,
          seed: next.record.seed,
          engineVersion: next.record.engineVersion,
        });
        analytics.current?.track('game_started', 0, {
          scenario_id: next.record.scenarioId,
          difficulty: next.record.difficulty,
          resumed: false,
        });
      } else if (command.type === 'restore' && !analytics.current) {
        sessionStartedAt.current = Date.now();
        previousElapsed.current = next.record.elapsed;
        analytics.current = await createAnalyticsSession({
          scenarioId: next.record.scenarioId,
          scenarioVersion: next.record.scenarioVersion,
          difficulty: next.record.difficulty,
          seed: next.record.seed,
          engineVersion: next.record.engineVersion,
        });
        analytics.current?.track('game_resumed', next.record.elapsed, {
          scenario_id: next.record.scenarioId,
          difficulty: next.record.difficulty,
          resumed: true,
        });
      }
      if (command.type === 'tick' && command.seconds === 30)
        analytics.current?.track('time_advanced', next.record.elapsed, {
          seconds: 30,
          source: 'step_button',
        });
      if (command.type === 'tick') {
        const simulatedSeconds = next.record.elapsed - previousElapsed.current;
        if (simulatedSeconds > 0)
          analytics.current?.track('time_advanced', next.record.elapsed, {
            seconds: simulatedSeconds,
            source: command.seconds === 30 ? 'step_button' : 'clock',
            speed,
          });
      }
      if (command.type === 'action')
        analytics.current?.track('intervention_started', next.record.elapsed, {
          action: command.action,
          target: command.target ?? null,
        });
      if (command.type === 'instrumentation')
        analytics.current?.track('instrumentation_changed', next.record.elapsed, {
          metric: command.metric,
          enabled: command.enabled,
        });
      if (command.type === 'hypothesis')
        analytics.current?.track('hypothesis_added', next.record.elapsed);
      if (command.type === 'inspect-sessions')
        analytics.current?.track('database_sessions_inspected', next.record.elapsed);
      if (command.type === 'terminate-session')
        analytics.current?.track('database_session_terminated', next.record.elapsed, {
          pid: command.pid,
        });
      if (command.type === 'query-plan')
        analytics.current?.track('query_plan_viewed', next.record.elapsed, {
          endpoint: command.endpoint,
          query_id: command.queryId,
        });
      if (command.type === 'finish') {
        analytics.current?.track('game_finished', next.record.elapsed, {
          outcome: next.observation.status,
        });
        if (analytics.current && sessionStartedAt.current !== null)
          void analytics.current.finish(
            Date.now() - sessionStartedAt.current,
            next.record.elapsed,
            next.observation.status === 'resolved' ? 'resolved' : 'ended',
          );
        analytics.current = null;
        sessionStartedAt.current = null;
      } else if (
        next.observation.status !== 'active' &&
        analytics.current &&
        sessionStartedAt.current !== null
      ) {
        analytics.current.track('game_finished', next.record.elapsed, {
          outcome: next.observation.status,
          source: 'simulation',
        });
        void analytics.current.finish(
          Date.now() - sessionStartedAt.current,
          next.record.elapsed,
          next.observation.status === 'resolved' ? 'resolved' : 'ended',
        );
        analytics.current = null;
        sessionStartedAt.current = null;
      }
      if (command.type === 'tick' && next.record.elapsed !== previousElapsed.current)
        previousElapsed.current = next.record.elapsed;
      return next;
    } catch (cause) {
      setPaused(true);
      setError(cause instanceof Error ? cause.message : 'Não foi possível executar a simulação.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (snapshot && !hasInvestigationTools(snapshot)) {
      void send({ type: 'restore', json: JSON.stringify(snapshot.record) });
    }
  }, [snapshot]);

  useEffect(() => {
    if (paused || !snapshot || snapshot.observation.status !== 'active') return;
    const interval = setInterval(() => {
      void send({ type: 'tick', seconds: speed });
    }, 1000);
    return () => clearInterval(interval);
  }, [paused, speed, snapshot?.observation.status]);

  useEffect(() => {
    if (!analytics.current) {
      previousSpeed.current = speed;
      previousPaused.current = paused;
      return;
    }
    if (speed !== previousSpeed.current) {
      analytics.current.track('simulation_speed_changed', snapshot?.record.elapsed ?? 0, {
        from: previousSpeed.current,
        to: speed,
      });
      previousSpeed.current = speed;
    }
    if (paused !== previousPaused.current) {
      analytics.current.track(
        paused ? 'simulation_paused' : 'simulation_resumed',
        snapshot?.record.elapsed ?? 0,
      );
      previousPaused.current = paused;
    }
  }, [paused, speed, snapshot?.record.elapsed]);

  useEffect(() => {
    if (!sessionNavigation) return;
    databasePanel.current?.focus({ preventScroll: true });
    databasePanel.current?.scrollIntoView?.({ block: 'start' });
  }, [sessionNavigation]);

  async function selectDatabaseSession() {
    setTab('Application');
    setShowReport(false);
    if (snapshot?.observation.database && !(await send({ type: 'inspect-sessions' }))) return;
    setSessionNavigation((current) => current + 1);
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    const next = await send({ type: 'start', seed: Number(seed), difficulty: mode, scenarioId });
    if (next) {
      setPaused(false);
      setShowReport(false);
      setTab('Overview');
    }
  }

  const selectedScenario =
    scenarioCatalog.find(
      (scenario) => scenario.id === (snapshot?.record.scenarioId ?? scenarioId),
    ) ?? scenarioCatalog[0];
  const view = snapshot?.observation;
  const ended = view?.status !== 'active';

  if (!snapshot || !view)
    return (
      <div className="briefing-page">
        <header className="briefing-header">
          <Brand />
          <span className="eyebrow">UM SIMULADOR DE ENGENHARIA DE SOFTWARE</span>
          <span className="local-pill">
            <i className="healthy-dot" /> No navegador
          </span>
        </header>
        <main className="briefing-layout">
          <section className="briefing-copy">
            <div className="eyebrow accent">MENOS TEORIA. MAIS “POR QUE CAIU?”</div>
            <h1>
              Seu primeiro plantão.
              <br />
              Um pouco de <em>caos.</em>
            </h1>
            <p className="intro">
              O código funciona. Até que não funciona mais.
              <br />
              Entre em produção, siga as evidências e descubra como recuperar o sistema.
            </p>
            <div className="briefing-facts">
              <span>01 / Investigue os sintomas</span>
              <span>02 / Teste suas hipóteses</span>
              <span>03 / Aprenda com as consequências</span>
            </div>
            <p className="briefing-note">
              Sem cadastro. Sem instalação. Sem prejudicar clientes reais.
            </p>
          </section>
          <section className="briefing-card">
            <div className="card-label">
              <span>SEU DESAFIO</span>
              <span>INCIDENTE {selectedScenario.number}</span>
            </div>
            <div className="scenario-selection">
              <div className="scenario-selection-heading">
                <div>
                  <span className="eyebrow accent">ESCOLHA SEU PLANTÃO</span>
                  <h2>Incidentes disponíveis</h2>
                </div>
                <span className="scenario-count">
                  {scenarioCatalog.length.toString().padStart(2, '0')} / CENÁRIOS
                </span>
              </div>
              <div className="scenario-filters" role="group" aria-label="Filtrar por dificuldade">
                {['Todos', ...new Set(scenarioCatalog.map((scenario) => scenario.challenge))].map(
                  (filter) => (
                    <button
                      key={filter}
                      type="button"
                      aria-pressed={scenarioFilter === filter}
                      onClick={() => {
                        setScenarioFilter(filter);
                        const visible = scenarioCatalog.filter(
                          (scenario) => filter === 'Todos' || scenario.challenge === filter,
                        );
                        if (!visible.some((scenario) => scenario.id === scenarioId))
                          setScenarioId(visible[0].id);
                      }}
                    >
                      {filter}
                    </button>
                  ),
                )}
              </div>
              <div className="scenario-cards">
                {scenarioCatalog
                  .filter(
                    (scenario) =>
                      scenarioFilter === 'Todos' || scenario.challenge === scenarioFilter,
                  )
                  .map((scenario) => (
                    <label
                      key={scenario.id}
                      className={`scenario-option ${scenarioId === scenario.id ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="scenario"
                        aria-label={`Incidente ${scenario.number}: ${scenario.title}`}
                        checked={scenarioId === scenario.id}
                        onChange={() => setScenarioId(scenario.id)}
                      />
                      <span className="scenario-option-top">
                        <span>INCIDENTE / {scenario.number}</span>
                        <span
                          className={`scenario-difficulty ${scenario.challenge === 'Inicial' ? 'initial' : 'intermediate'}`}
                        >
                          {scenario.challenge}
                        </span>
                      </span>
                      <strong>{scenario.title}</strong>
                      <span className="scenario-option-bottom">
                        MERCADO · PRODUÇÃO <span aria-hidden="true">↗</span>
                      </span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="service-heading">
              <span className="service-icon">m.</span>
              <div>
                <h2>Mercado</h2>
                <span>Plataforma de comércio · Produção</span>
              </div>
              <span className="status-badge degraded">
                <i /> Degradado
              </span>
            </div>
            <h3 className="scenario-title">{selectedScenario.title}</h3>
            <p>{selectedScenario.briefing}</p>
            <div className="briefing-objectives">
              <strong>Suas metas operacionais</strong>
              <span>
                Latência p95 <b>&lt; 800 ms</b>
              </span>
              <span>
                Erros nas requisições <b>&lt; 1%</b>
              </span>
              <span>
                Janela de recuperação estável <b>60 segundos simulados</b>
              </span>
            </div>
            <form onSubmit={start}>
              <fieldset className="mode-picker">
                <legend>Escolha como investigar</legend>
                <label className={mode === 'guided' ? 'chosen' : ''}>
                  <input
                    type="radio"
                    name="mode"
                    value="guided"
                    checked={mode === 'guided'}
                    onChange={() => setMode('guided')}
                  />
                  <span>
                    <strong>Investigação guiada</strong>
                    <small>Ferramentas selecionadas e explicações detalhadas.</small>
                  </span>
                </label>
                <label className={mode === 'free' ? 'chosen' : ''}>
                  <input
                    type="radio"
                    name="mode"
                    value="free"
                    checked={mode === 'free'}
                    onChange={() => setMode('free')}
                  />
                  <span>
                    <strong>Exploração livre</strong>
                    <small>Instrumente os sinais, escolha os alvos e meça as consequências.</small>
                  </span>
                </label>
              </fieldset>
              <label className="seed-label">
                Seed da simulação
                <input
                  aria-label="Seed da simulação"
                  type="number"
                  min="0"
                  max="4294967295"
                  step="1"
                  required
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                />
              </label>
              <button className="primary wide" disabled={busy} type="submit">
                {busy ? 'Abrindo a sala do incidente…' : 'Entrar na sala do incidente'}{' '}
                <span>↗</span>
              </button>
            </form>
            {saved && (
              <button
                className="resume-button"
                disabled={busy}
                onClick={() => void send({ type: 'restore', json: saved })}
              >
                ↶ Retomar investigação salva
              </button>
            )}
            <p className="microcopy">Pause quando precisar. Você tem tempo para pensar.</p>
            {error && (
              <p role="alert" className="error-message">
                {error}
              </p>
            )}
          </section>
        </main>
        <footer className="briefing-footer">
          <span>PARA QUEM QUER ENTENDER O SISTEMA.</span>
          <span>Um sistema. Várias explicações possíveis.</span>
          <FeedbackForm />
          <span>MVP INICIAL / 1.0</span>
        </footer>
      </div>
    );

  if (!hasInvestigationTools(snapshot))
    return (
      <p className="empty-copy" role="status">
        Atualizando ferramentas da investigação…
      </p>
    );
  const metrics = view.metrics;
  const pressure =
    view.status !== 'active'
      ? 'calm'
      : metrics.errorRate >= 5 || metrics.latency >= 1600 || metrics.databaseUtilization >= 90
        ? 'critical'
        : metrics.errorRate >= 1 || metrics.latency >= 800 || metrics.databaseUtilization >= 75
          ? 'warning'
          : 'calm';
  return (
    <div className={`app-shell pressure-${pressure}`}>
      <header className="topbar">
        <Brand />
        <div className="workspace-path">
          <span>/</span> Sala do incidente <span>/</span>
          <strong>Mercado</strong>
          <span className="environment">PRODUÇÃO</span>
        </div>
        <span className="local-pill">
          <i className="healthy-dot" /> Salvo no navegador
        </span>
      </header>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-section">INVESTIGAÇÃO</div>
          <nav aria-label="Ferramentas de investigação">
            {tabs
              .filter((name) => name !== 'Observability' || mode === 'free')
              .map((name) => (
                <button
                  key={name}
                  className={tab === name && !showReport ? 'active' : ''}
                  onClick={() => {
                    if (tab !== name)
                      analytics.current?.track('tab_opened', view.elapsed, { tab: name });
                    setTab(name);
                    setShowReport(false);
                  }}
                >
                  <span aria-hidden="true">{symbols[tabs.indexOf(name)]}</span>
                  {tabLabels[name]}
                </button>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="sidebar-tip">
              <span className="tip-icon">↳</span>
              <strong>Siga as evidências.</strong>
              <p>Um sintoma é um ponto de partida, não um diagnóstico.</p>
            </div>
            <div className="mode-indicator">
              <span>◇</span>
              <div>
                {snapshot.record.difficulty === 'guided'
                  ? 'Investigação guiada'
                  : 'Exploração livre'}
                <small>Seed {snapshot.record.seed}</small>
              </div>
            </div>
            <button
              className="sidebar-link"
              onClick={() => {
                setPaused(true);
                setSnapshot(null);
                setShowReport(false);
                setSelectedAction(null);
              }}
            >
              ← Voltar ao briefing
            </button>
          </div>
        </aside>
        <div className="workspace">
          <div className="incident-bar">
            <div>
              <span
                className={`status-badge ${view.status === 'resolved' ? 'resolved' : 'degraded'}`}
              >
                <i />
                {view.status === 'resolved'
                  ? 'Recuperado'
                  : view.status === 'ended'
                    ? 'Investigação encerrada'
                    : 'Incidente ativo'}
              </span>
              <span className="incident-id">INC–{selectedScenario.number}</span>
            </div>
            <div className="time-controls">
              <span className="sim-time">
                <span>TEMPO SIMULADO</span>
                <b>{clock(view.elapsed)}</b>
              </span>
              <button
                aria-label={paused ? 'Continuar simulação' : 'Pausar simulação'}
                className="pause-button"
                onClick={() => setPaused(!paused)}
                disabled={ended}
              >
                {paused ? '▶' : 'Ⅱ'} <span>{paused ? 'Continuar' : 'Pausar'}</span>
              </button>
              <select
                aria-label="Velocidade da simulação"
                value={speed}
                disabled={ended}
                onChange={(event) => setSpeed(Number(event.target.value))}
              >
                <option value="1">1×</option>
                <option value="5">5×</option>
                <option value="20">20×</option>
              </select>
              <button
                className="step-button"
                disabled={ended || busy}
                onClick={() => {
                  setPaused(true);
                  void send({ type: 'tick', seconds: 30 });
                }}
              >
                +30s
              </button>
            </div>
          </div>
          {(error || storageError) && (
            <div className="error-message" role="alert">
              {error || storageError}
            </div>
          )}
          {ended && !showReport && (
            <div className="recovery-banner">
              <div>
                <strong>
                  {view.status === 'resolved'
                    ? 'Tudo no verde novamente.'
                    : 'Investigação concluída.'}
                </strong>
                <span>
                  {view.status === 'resolved'
                    ? 'O serviço cumpriu as metas por 60 segundos consecutivos.'
                    : 'Revise as evidências, o impacto e as estratégias possíveis.'}
                </span>
              </div>
              <button className="primary" onClick={() => setShowReport(true)}>
                Ler postmortem ↗
              </button>
            </div>
          )}
          <main className="investigation-main">
            {showReport && snapshot.report ? (
              <section className="postmortem">
                <div className="eyebrow accent">REVISÃO DO INCIDENTE / MERCADO</div>
                <h1>
                  Todo incidente deixa
                  <br />
                  algo para aprender.
                </h1>
                <p className="section-description">
                  {snapshot.report.resolved ? 'Serviço recuperado' : 'Investigação encerrada'} às{' '}
                  {clock(snapshot.report.elapsed)} ·{' '}
                  {snapshot.report.repaired
                    ? getScenario(snapshot.record.scenarioId).presentation.repairedLabel
                    : getScenario(snapshot.record.scenarioId).presentation.unrepairedLabel}
                </p>
                <div className="report-stats">
                  <Metric title="Duração simulada" value={clock(snapshot.report.elapsed)} unit="">
                    Desde o início do seu plantão
                  </Metric>
                  <Metric
                    title="Requisições com falha"
                    value={snapshot.report.failedRequests.toLocaleString('pt-BR')}
                    unit=""
                  >
                    {snapshot.report.totalRequests.toLocaleString('pt-BR')} requisições observadas
                  </Metric>
                  <Metric
                    title="Custo de infraestrutura"
                    value={`US$ ${snapshot.report.cost.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
                    unit=""
                  >
                    US${' '}
                    {snapshot.report.hourlyCost.toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    /hora ao final da partida
                  </Metric>
                </div>
                <article className="panel report-explanation">
                  <span className="eyebrow accent">CAUSA RAIZ</span>
                  <h2>O que realmente aconteceu</h2>
                  <p>{snapshot.report.rootCause}</p>
                  <p>{snapshot.report.explanation}</p>
                </article>
                <InterventionReview report={snapshot.report} />
                {snapshot.report.remainingIssues.length > 0 && (
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Pendências após a recuperação</h2>
                    </div>
                    {snapshot.report.remainingIssues.map((issue) => (
                      <p className="alternative" key={issue}>
                        {issue}
                      </p>
                    ))}
                  </section>
                )}
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Consequências das decisões</h2>
                  </div>
                  {snapshot.report.abortedCheckouts > 0 && (
                    <p className="alternative">
                      Compras abortadas ao encerrar sessões: {snapshot.report.abortedCheckouts}.
                      Inclui reinícios de nós. Falhas adicionais de reconexão estão incluídas no
                      total de requisições com falha.
                    </p>
                  )}
                  {snapshot.report.instrumentation.enabled.length > 0 && (
                    <p className="alternative">
                      Instrumentação mantida:{' '}
                      {snapshot.report.instrumentation.overhead.databaseWork} unidades/s no banco, +
                      {snapshot.report.instrumentation.overhead.latency} ms por requisição e US${' '}
                      {snapshot.report.instrumentation.overhead.hourlyCost.toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                      /h.
                    </p>
                  )}
                  {snapshot.report.stoppedOperations.length > 0 && (
                    <p className="alternative">
                      Operações ainda interrompidas: {snapshot.report.stoppedOperations.join(', ')}.
                    </p>
                  )}
                  {snapshot.report.risks.length ? (
                    snapshot.report.risks.map((risk, index) => (
                      <div className="risk-row" key={`${risk.name}-${index}`}>
                        <strong>{risk.name}</strong>
                        <p>{risk.tradeoff}</p>
                      </div>
                    ))
                  ) : (
                    <p className="empty-copy">
                      Nenhuma intervenção foi concluída. Apenas investigar não altera o sistema em
                      execução.
                    </p>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Outros caminhos para a recuperação</h2>
                  </div>
                  {snapshot.report.alternatives.map((item) => (
                    <p className="alternative" key={item}>
                      {item}
                    </p>
                  ))}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Linha do tempo do incidente</h2>
                  </div>
                  <Timeline entries={snapshot.report.timeline} />
                </section>
                <button
                  className="primary"
                  onClick={() => {
                    setSnapshot(null);
                    setSelectedAction(null);
                    setShowReport(false);
                  }}
                >
                  Testar outra estratégia ↗
                </button>
              </section>
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">
                      INCIDENTE {selectedScenario.number} <span>/</span> LOJA MERCADO
                    </div>
                    <h1>{tabLabels[tab]}</h1>
                    <p className="section-description">{tabDescriptions[tab]}</p>
                  </div>
                  <span className="live-indicator">
                    <i className={paused || ended ? '' : 'healthy-dot'} />
                    {ended ? 'ESTADO FINAL' : paused ? 'PAUSADO' : 'TELEMETRIA AO VIVO'}
                  </span>
                </div>
                {tab === 'Overview' && (
                  <div className="metrics-grid">
                    <Metric
                      title="Tráfego de requisições"
                      value={metrics.rps.toLocaleString('pt-BR')}
                      unit="req/s"
                    >
                      Referência <b>300 req/s</b>
                    </Metric>
                    <Metric
                      title="Latência · p95"
                      value={metrics.latency.toLocaleString('pt-BR')}
                      unit="ms"
                      state={metrics.latency > 800 ? 'bad' : 'good'}
                    >
                      <span className={metrics.latency > 800 ? 'text-warning' : 'text-green'}>
                        {metrics.latency > 800 ? '↗ Acima da meta' : '↘ Dentro da meta'}
                      </span>
                      <span>Meta &lt; 800 ms</span>
                    </Metric>
                    <Metric
                      title="Taxa de erros · 5xx"
                      value={metrics.errorRate.toLocaleString('pt-BR', {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                      unit="%"
                      state={metrics.errorRate > 1 ? 'bad' : 'good'}
                    >
                      <span className={metrics.errorRate > 1 ? 'text-warning' : 'text-green'}>
                        {metrics.errorRate > 1 ? '↗ Acima da meta' : 'Dentro da meta'}
                      </span>
                      <span>Meta &lt; 1%</span>
                    </Metric>
                    <Metric
                      title="Custo de infraestrutura"
                      value={`US$ ${metrics.hourlyCost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      unit="/h"
                    >
                      Custo inicial <b>US$ 0,28/h</b>
                    </Metric>
                  </div>
                )}
                {tab === 'Overview' && (
                  <>
                    <div className="chart-grid">
                      <section className="panel chart-panel">
                        <div className="panel-heading">
                          <h2>
                            <span className="legend-dot amber" />
                            Tempo de resposta
                          </h2>
                          <span>
                            p95 · ms <b>ÚLTIMOS 120s</b>
                          </span>
                        </div>
                        <div className="chart-value">
                          {metrics.latency.toLocaleString('pt-BR')} <small>ms</small>
                          <span>··· meta de 800 ms</span>
                        </div>
                        <Chart
                          history={view.history}
                          metric="latency"
                          color="#FFB020"
                          label="Latência p95 ao longo do tempo simulado"
                          threshold={800}
                        />
                        <div className="chart-axis">
                          <span>{clock(Math.max(0, view.elapsed - 119))}</span>
                          <span>tempo simulado</span>
                          <span>{clock(view.elapsed)}</span>
                        </div>
                      </section>
                      <section className="panel chart-panel">
                        <div className="panel-heading">
                          <h2>
                            <span className="legend-dot green" />
                            Uso de recursos
                          </h2>
                          <span>BANCO · %</span>
                        </div>
                        <div className="chart-value">
                          {metrics.databaseUtilization.toLocaleString('pt-BR', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 0,
                          })}
                          <small>%</small>
                          <span>
                            CPU DA API{' '}
                            {metrics.apiUtilization.toLocaleString('pt-BR', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                            %
                          </span>
                        </div>
                        <Chart
                          history={view.history}
                          metric="database"
                          color="#3DD6C6"
                          label="Utilização do banco ao longo do tempo simulado"
                          threshold={85}
                        />
                        <div className="chart-axis">
                          <span>{clock(Math.max(0, view.elapsed - 119))}</span>
                          <span>tempo simulado</span>
                          <span>{clock(view.elapsed)}</span>
                        </div>
                      </section>
                    </div>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Saúde dos componentes</h2>
                        <button className="text-button" onClick={() => setTab('Architecture')}>
                          Inspecionar arquitetura ↗
                        </button>
                      </div>
                      <Topology view={view} />
                      <div className="panel-footer">
                        <span>
                          <i className="healthy-dot" /> Saudável
                        </span>
                        <span>
                          <i className="warning-dot" /> Sob pressão
                        </span>
                        <span>
                          Fila compartilhada do banco:{' '}
                          <b>{metrics.queue.toLocaleString('pt-BR')} unidades de trabalho</b>
                        </span>
                      </div>
                    </section>
                    <div className="learning-note">
                      <span>↳</span>
                      <p>
                        <strong>Comece com uma pergunta.</strong> O sistema está processando
                        trabalho ou esperando? Compare os endpoints, os logs e as evidências da
                        aplicação antes de intervir.
                      </p>
                    </div>
                  </>
                )}
                {tab === 'Endpoints' && (
                  <>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Distribuição das requisições</h2>
                        <span>DEPENDÊNCIA COMPARTILHADA: POSTGRESQL</span>
                      </div>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Endpoint</th>
                              <th>Requisições / s</th>
                              <th>Latência p95</th>
                              <th>Erros</th>
                              <th>Parcela do tráfego</th>
                            </tr>
                          </thead>
                          <tbody>
                            {view.endpoints.map((endpoint) => (
                              <tr key={endpoint.path}>
                                <td>
                                  <code>{endpoint.path}</code>
                                </td>
                                <td>{endpoint.rps}</td>
                                <td
                                  className={endpoint.latency > 800 ? 'text-warning' : 'text-green'}
                                >
                                  {endpoint.latency.toLocaleString('pt-BR')} ms
                                </td>
                                <td>
                                  {endpoint.errorRate.toLocaleString('pt-BR', {
                                    maximumFractionDigits: 1,
                                  })}
                                  %
                                </td>
                                <td>
                                  <span className="traffic-bar">
                                    <span
                                      style={{ width: `${(endpoint.rps / metrics.rps) * 100}%` }}
                                    />
                                  </span>
                                  {Math.round((endpoint.rps / metrics.rps) * 100)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="panel-footer">
                        Referência: 300 req/s no total · Taxas de erro relativas a cada endpoint.
                      </div>
                    </section>
                    {view.checkoutBreakdown.length > 0 ? (
                      <CheckoutBreakdown segments={view.checkoutBreakdown} />
                    ) : (
                      mode === 'free' &&
                      getScenario(snapshot.record.scenarioId).presentation
                        .showCheckoutDimensionGap && (
                        <TelemetryGap
                          title="Dimensões das compras não instrumentadas"
                          onConfigure={() => setTab('Observability')}
                        />
                      )
                    )}
                  </>
                )}
                {tab === 'Application' && (
                  <>
                    {mode === 'guided' || view.instrumentation.enabled.includes('query-plans') ? (
                      <ApplicationPanel
                        endpoints={view.endpoints}
                        plan={snapshot.queryPlan}
                        busy={busy}
                        difficulty={snapshot.record.difficulty}
                        fetchPlan={(endpoint, queryId) => {
                          void send({ type: 'query-plan', endpoint, queryId });
                        }}
                      />
                    ) : (
                      <TelemetryGap
                        title="Planos de execução não instrumentados"
                        onConfigure={() => setTab('Observability')}
                      />
                    )}
                    {(getScenario(snapshot.record.scenarioId).presentation
                      .showDatabaseSessionsInGuided ||
                      mode === 'free') && (
                      <div
                        ref={databasePanel}
                        role="region"
                        aria-label="Seleção de sessão do banco"
                        tabIndex={-1}
                      >
                        {view.database ? (
                          <DatabaseSessions
                            view={view}
                            busy={busy}
                            onInspect={() => {
                              void send({ type: 'inspect-sessions' });
                            }}
                            onTerminate={(pid) => {
                              void send({ type: 'terminate-session', pid });
                            }}
                          />
                        ) : (
                          <TelemetryGap
                            title="Sessões do banco não instrumentadas"
                            onConfigure={() => setTab('Observability')}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
                {tab === 'Observability' && (
                  <Observability
                    view={view}
                    disabled={ended || busy}
                    onConfigure={(metric, enabled) => {
                      void send({ type: 'instrumentation', metric, enabled });
                    }}
                  />
                )}
                {tab === 'Logs' && (
                  <section className="panel logs-panel">
                    <div className="log-toolbar">
                      <label className="search-box">
                        <span>⌕</span>
                        <input
                          aria-label="Buscar nos logs"
                          placeholder="Buscar logs, endpoints, planos de execução…"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                      </label>
                      <select
                        aria-label="Severidade do log"
                        value={level}
                        onChange={(event) => setLevel(event.target.value)}
                      >
                        <option value="ALL">Todos os níveis</option>
                        <option>INFO</option>
                        <option>WARN</option>
                        <option>ERROR</option>
                      </select>
                    </div>
                    <div className="log-caption">
                      TEMPO SIMULADO <span>NÍVEL</span> MENSAGEM{' '}
                      <small>Últimos 200 registros · atualização a cada 10s</small>
                    </div>
                    <div className="log-list" role="log" aria-label="Logs da aplicação">
                      {view.logs
                        .filter(
                          (log) =>
                            (level === 'ALL' || log.kind === level) &&
                            log.message.toLowerCase().includes(query.toLowerCase()),
                        )
                        .slice(-200)
                        .reverse()
                        .map((log, i) => (
                          <div className="log-row" key={`${log.at}-${i}`}>
                            <time>{clock(log.at)}</time>
                            <span className={`log-level ${log.kind}`}>{log.kind}</span>
                            <code>{log.message}</code>
                          </div>
                        ))}
                      {!view.logs.some(
                        (log) =>
                          (level === 'ALL' || log.kind === level) &&
                          log.message.toLowerCase().includes(query.toLowerCase()),
                      ) && (
                        <p className="empty-copy">
                          Nenhum log corresponde à busca. Tente outro termo ou severidade.
                        </p>
                      )}
                    </div>
                  </section>
                )}
                {(tab === 'Deploys' || tab === 'Customer messages' || tab === 'Alerts') && (
                  <SignalSection entries={view.events} channel={tab} />
                )}
                {tab === 'Deploys' && view.events.some((event) => event.kind === 'job') && (
                  <section className="panel" role="region" aria-label="Atividades agendadas">
                    <div className="panel-heading">
                      <h2>Atividades agendadas</h2>
                    </div>
                    <Timeline entries={view.events.filter((event) => event.kind === 'job')} />
                  </section>
                )}
                {tab === 'Architecture' && (
                  <>
                    <section className="panel">
                      <div className="panel-heading">
                        <h2>Topologia atual</h2>
                        <span>INTERVENÇÕES ESTRUTURADAS</span>
                      </div>
                      <Topology view={view} expanded />
                      <div className="panel-footer">
                        Os componentes mudam quando uma intervenção é concluída. Não há execução de
                        código arbitrário.
                      </div>
                    </section>
                    <div className="architecture-details">
                      <section className="panel">
                        <div className="panel-heading">
                          <h2>Camada de aplicação</h2>
                        </div>
                        <dl>
                          <dt>Instâncias</dt>
                          <dd>{view.topology.apiInstances}</dd>
                          <dt>Capacidade</dt>
                          <dd>{view.topology.apiInstances * 600} req/s</dd>
                          <dt>Utilização de CPU</dt>
                          <dd>
                            {metrics.apiUtilization.toLocaleString('pt-BR', {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                            %
                          </dd>
                        </dl>
                      </section>
                      <section className="panel">
                        <div className="panel-heading">
                          <h2>Camada de banco de dados</h2>
                        </div>
                        <dl>
                          <dt>Conexões em uso</dt>
                          <dd>
                            {metrics.connections} / {view.topology.pool}
                          </dd>
                          <dt>Tamanho da fila</dt>
                          <dd>{metrics.queue.toLocaleString('pt-BR')} unidades de trabalho</dd>
                          <dt>Utilização</dt>
                          <dd>
                            {metrics.databaseUtilization.toLocaleString('pt-BR', {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                            %
                          </dd>
                          <dt>Capacidade do primário</dt>
                          <dd>
                            {view.topology.databaseCapacity.toLocaleString('pt-BR')} unidades/s
                          </dd>
                          <dt>Limite de espera por bloqueios</dt>
                          <dd>{view.topology.lockTimeout ? '1 segundo' : '5 segundos'}</dd>
                          <dt>Limite de transação ociosa</dt>
                          <dd>{view.topology.idleTimeout ? '180 segundos' : 'Desativado'}</dd>
                          <dt>Operações interrompidas</dt>
                          <dd>{view.topology.stoppedOperations.join(', ') || 'Nenhuma'}</dd>
                          <dt>Índices criados</dt>
                          <dd>{view.topology.indexes.join(', ') || 'Nenhum'}</dd>
                          <dt>Réplicas de leitura</dt>
                          <dd>{view.topology.replica ? 1 : 0}</dd>
                        </dl>
                      </section>
                    </div>
                  </>
                )}
              </>
            )}
          </main>
          <footer className="workspace-footer">
            <span>
              <i className="healthy-dot" /> Sistemas simulados. Aprendizados reais.
            </span>
            <span>
              MOTOR {ENGINE_VERSION} <span>·</span> SEED {snapshot.record.seed}
            </span>
            <FeedbackForm />
          </footer>
        </div>
        <aside className="interventions-sidebar">
          <div className="interventions-heading">
            <div className="eyebrow">SUAS FERRAMENTAS</div>
            <h2>
              Hora de intervir<span>↗</span>
            </h2>
            <p>
              Entenda os custos e riscos.
              <br />
              Depois, altere o sistema.
            </p>
          </div>
          {view.instrumentation.pending && (
            <div className="pending-action" role="status">
              <span className="eyebrow">INSTRUMENTAÇÃO EM ANDAMENTO</span>
              <strong>
                {instruments.find((item) => item.id === view.instrumentation.pending!.metric)?.name}
              </strong>
              <span>
                {view.instrumentation.pending.completesAt - view.elapsed}s de tempo simulado
                restantes
              </span>
              {paused && <small>Continue ou avance o tempo para concluir.</small>}
            </div>
          )}
          {view.pending && (
            <div className="pending-action" role="status">
              <span className="eyebrow">INTERVENÇÃO EM ANDAMENTO</span>
              <strong>
                {
                  availableActions(mode, scenarioId).find(
                    (item) => item.id === view.pending!.action,
                  )?.name
                }
                {view.pending.target && <small>Alvo: {view.pending.target}</small>}
              </strong>
              <span>
                {Math.max(0, view.pending.completesAt - view.elapsed)}s de tempo simulado restantes
              </span>
              <progress
                max={interventions.find((item) => item.id === view.pending!.action)!.seconds}
                value={
                  interventions.find((item) => item.id === view.pending!.action)!.seconds -
                  (view.pending.completesAt - view.elapsed)
                }
              />
              {paused && <small>A simulação está pausada. Continue ou avance o tempo.</small>}
            </div>
          )}
          <InterventionTools
            mode={snapshot.record.difficulty}
            scenarioId={snapshot.record.scenarioId}
            view={view}
            selected={selectedAction}
            disabled={ended || busy}
            onSelect={setSelectedAction}
            onApply={(id, target) => {
              if (id === 'terminate-session') {
                void selectDatabaseSession();
              } else void send({ type: 'action', action: id, target });
            }}
          />
          <div className="toolkit-note">
            <span>ⓘ</span>
            <p>Mudanças levam tempo simulado. Observe o resultado antes da próxima intervenção.</p>
          </div>
          <div className="recovery-progress">
            <span>
              JANELA DE RECUPERAÇÃO <b>{view.stableSeconds}/60s</b>
            </span>
            <progress max={60} value={view.stableSeconds} />
            <small>As duas metas devem permanecer saudáveis.</small>
          </div>
          {ended ? (
            <button className="end-button" onClick={() => setShowReport(true)}>
              Abrir postmortem ↗
            </button>
          ) : (
            <button
              className="end-button"
              onClick={() => {
                setPaused(true);
                setConfirmEnd(true);
              }}
            >
              Encerrar investigação <span>↗</span>
            </button>
          )}
        </aside>
      </div>
      {confirmEnd && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-title"
            className="confirmation-dialog"
          >
            <div className="eyebrow accent">REVISÃO DO INCIDENTE</div>
            <h2 id="end-title">Pronto para encerrar a investigação?</h2>
            <p>
              Isso encerra a partida e revela a causa, o impacto das decisões e as estratégias de
              recuperação disponíveis.
            </p>
            <div>
              <button autoFocus onClick={() => setConfirmEnd(false)}>
                Continuar investigando
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (await send({ type: 'finish' })) {
                    setConfirmEnd(false);
                    setShowReport(true);
                  }
                }}
              >
                Encerrar e revisar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
