import { z } from 'zod';
import {
  createProcesses,
  databaseWork,
  terminateProcess,
  advanceProcesses,
  conflictingProcesses,
  stopProcess,
  resumeProcess,
  type SimulatedProcess,
} from './processes';
import { getScenario, scenarioCatalog } from '../../scenarios/src';
import {
  availableActions,
  interventions,
  instruments,
  requiresActionTarget,
  cacheProfiles,
  type InstrumentId,
  type ActionId,
  type Difficulty,
} from '../../educational-content/src';

export const ENGINE_VERSION = '3.0.0';
const actionIds = interventions.map((a) => a.id) as [ActionId, ...ActionId[]];
const decisionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('action'),
    at: z.number().int().nonnegative(),
    action: z.enum(actionIds),
    targetPid: z.number().int().positive().optional(),
    target: z.string().min(1).max(100).optional(),
  }),
  z.object({
    kind: z.literal('instrumentation'),
    at: z.number().int().nonnegative(),
    metric: z.enum(['database-sessions', 'checkout-dimensions', 'query-plans', 'detailed-logs']),
    enabled: z.boolean(),
  }),
  z.object({ kind: z.literal('inspection'), at: z.number().int().nonnegative() }),
  z.object({
    kind: z.literal('hypothesis'),
    at: z.number().int().nonnegative(),
    text: z.string().trim().min(1).max(500),
  }),
  z.object({ kind: z.literal('finish'), at: z.number().int().nonnegative() }),
]);
export const recordSchema = z
  .object({
    engineVersion: z.literal(ENGINE_VERSION),
    scenarioId: z.enum(scenarioCatalog.map((scenario) => scenario.id) as [string, ...string[]]),
    scenarioVersion: z.enum(['1.0.0', '2.0.0']),
    seed: z.number().int().min(0).max(4294967295),
    difficulty: z.enum(['guided', 'free']),
    elapsed: z.number().int().min(0).max(3600),
    decisions: z.array(decisionSchema).max(200),
  })
  .refine(
    (record) => getScenario(record.scenarioId).version === record.scenarioVersion,
    'Versão do cenário incompatível.',
  );
export type RunRecord = z.infer<typeof recordSchema>;
export interface Metrics {
  rps: number;
  latency: number;
  errorRate: number;
  apiUtilization: number;
  databaseUtilization: number;
  queue: number;
  connections: number;
  hourlyCost: number;
}
export interface Entry {
  at: number;
  kind: string;
  message: string;
}
export interface InterventionMetrics {
  latency: number;
  errors: number;
  queue: number;
}
export interface Run {
  record: RunRecord;
  processes: SimulatedProcess[];
  status: 'active' | 'resolved' | 'ended';
  random: number;
  system: {
    regression: boolean;
    cache: boolean;
    replica: boolean;
    apiInstances: number;
    pool: number;
    queue: number;
    replicaQueue: number;
    databaseScaled: boolean;
    catalogIndex: boolean;
    lockTimeout: boolean;
    idleTimeout: boolean;
    checkoutRegression: boolean;
    sessionPenaltyUntil: number;
    incorrectKills: number;
    backgroundResumeAt: number;
    backgroundAttempts: number;
    interruptedReadUntil: number;
    caches: string[];
    indexes: string[];
    optimized: string[];
    appliedTargets: string[];
    stoppedOperations: string[];
    replicaScaled: boolean;
    cacheScaled: boolean;
  };
  pending: { action: ActionId; completesAt: number; targetPid?: number; target?: string } | null;
  completed: ActionId[];
  instrumentation: InstrumentId[];
  instrumentationPending: { metric: InstrumentId; completesAt: number } | null;
  sessionsInspected: boolean;
  abortedCheckouts: number;
  interventionEvidence: {
    at: number;
    completesAt: number;
    before: InterventionMetrics;
    after: InterventionMetrics | null;
    followUp: (InterventionMetrics & { at: number }) | null;
  }[];
  metrics: Metrics;
  history: { at: number; latency: number; errors: number; database: number }[];
  logs: Entry[];
  events: Entry[];
  hypotheses: { at: number; text: string }[];
  stableSeconds: number;
  failedRequests: number;
  totalRequests: number;
  cost: number;
  scheduled: { at: number; kind: 'sample' | 'complete' | 'instrumentation'; priority: number }[];
}

function sample(run: Run) {
  run.random = (Math.imul(run.random, 1664525) + 1013904223) >>> 0;
  return run.random / 4294967296;
}

function hasInstrument(run: Run, id: InstrumentId) {
  return run.record.difficulty === 'guided' || run.instrumentation.includes(id);
}

function overhead(run: Run) {
  return instruments
    .filter((item) => run.instrumentation.includes(item.id))
    .reduce(
      (total, item) => ({
        databaseWork: total.databaseWork + item.databaseWork,
        latency: total.latency + item.latency,
        hourlyCost: total.hourlyCost + item.cost,
      }),
      { databaseWork: 0, latency: 0, hourlyCost: 0 },
    );
}

function endpointRestartShare(run: Run, index: number) {
  if (run.pending?.action !== 'restart') return 0;
  const target = run.pending.target;
  if (!target || target === 'database') return 1;
  if (target.startsWith('api-')) return 1 / run.system.apiInstances;
  if (target === 'replica')
    return getScenario(run.record.scenarioId).endpoints[index].path.startsWith('GET ') ? 0.5 : 0;
  return 0;
}

function restartShare(run: Run) {
  return getScenario(run.record.scenarioId).endpoints.reduce(
    (sum, endpoint, index) => sum + endpoint.share * endpointRestartShare(run, index),
    0,
  );
}

export function estimateCacheHitRate({
  readsPerSecond,
  writesPerSecond,
  keys,
  ttlSeconds,
}: {
  readsPerSecond: number;
  writesPerSecond: number;
  keys: number;
  ttlSeconds: number;
}) {
  if (readsPerSecond <= 0) return 0;
  return readsPerSecond / (readsPerSecond + writesPerSecond + keys / ttlSeconds);
}

function cacheHitRate(run: Run, path: string) {
  if (run.pending?.action === 'restart' && run.pending.target === 'cache') return 0;
  const scenario = getScenario(run.record.scenarioId);
  const profile = cacheProfiles[path];
  const endpointIndex = scenario.endpoints.findIndex((endpoint) => endpoint.path === path);
  if (!profile || endpointIndex < 0) return 0;
  const rate = (index: number) => {
    const endpoint = scenario.endpoints[index];
    if (
      endpoint.path === 'POST /checkout' &&
      run.system.stoppedOperations.includes('checkout-processing')
    )
      return 0;
    return scenario.baselineRps * endpoint.share * (1 - endpointRestartShare(run, index));
  };
  const writesPerSecond = scenario.endpoints.reduce(
    (sum, endpoint, index) => sum + rate(index) * (profile.writes[endpoint.path] ?? 0),
    0,
  );
  return estimateCacheHitRate({
    readsPerSecond: rate(endpointIndex),
    writesPerSecond,
    keys: profile.keys / (run.system.cacheScaled ? 1.2 : 1),
    ttlSeconds: profile.ttlSeconds,
  });
}

function cacheReduction(run: Run, path: string) {
  if (run.pending?.action === 'restart' && run.pending.target === 'cache') return 0;
  if (run.system.caches.includes(path) || (path === 'GET /products' && run.system.cache))
    return cacheHitRate(run, path) * cacheProfiles[path].cacheableWork;
  return 0;
}

export function actionTargets(run: Run) {
  const scenario = getScenario(run.record.scenarioId);
  const queries = scenario.endpoints.flatMap((endpoint) =>
    endpoint.queries.map((query) => ({
      id: query.id,
      indexExpression: query.indexExpression,
      label: `${endpoint.path} · ${query.name}`,
    })),
  );
  const nodes = [
    ...Array.from({ length: run.system.apiInstances }, (_, i) => ({
      id: `api-${i + 1}`,
      label: `API · nó ${i + 1}`,
    })),
    { id: 'database', label: 'PostgreSQL · primário' },
    ...(run.system.replica ? [{ id: 'replica', label: 'PostgreSQL · réplica de leitura' }] : []),
    ...(run.system.cache || run.system.caches.length
      ? [{ id: 'cache', label: 'Cache · nó de memória' }]
      : []),
    ...(scenario.incident.kind === 'row-lock'
      ? [{ id: 'inventory-worker', label: 'Worker · inventory-sync' }]
      : []),
    ...(scenario.incident.kind === 'workload-contention'
      ? [{ id: 'reconciliation-worker', label: 'Worker · orders-reconciliation' }]
      : []),
  ];
  const operations = [
    ...(scenario.processes ?? []).map((process) => ({ id: process.id, label: process.id })),
    { id: 'checkout-processing', label: 'checkout-processing · processamento de compras' },
    { id: 'receipt-delivery', label: 'receipt-delivery · entrega de recibos' },
    ...(scenario.incident.kind === 'row-lock'
      ? [{ id: 'inventory-sync', label: 'inventory-sync · execução 6f2' }]
      : []),
    ...(scenario.incident.kind === 'workload-contention'
      ? [{ id: 'orders-reconciliation', label: 'orders-reconciliation · execução r17' }]
      : []),
  ];
  return {
    cache: scenario.endpoints.map((endpoint) => ({ id: endpoint.path, label: endpoint.path })),
    'create-index': queries.map((query) => ({
      ...query,
      label: `${query.label} · ${query.indexExpression ?? (query.id === 'catalog-list' ? 'products(created_at)' : query.id === 'checkout-pricing' ? 'price_rules((product_id::text))' : query.id === 'customer-orders' ? 'orders(customer_id)' : 'products(id)')}`,
    })),
    'optimize-query': queries,
    'scale-api': [
      ...(run.system.apiInstances < 4
        ? [
            {
              id: 'api',
              label: `API · ${run.system.apiInstances} → ${run.system.apiInstances + 1} instâncias · +US$ 0,12/h`,
            },
          ]
        : []),
      ...(!run.system.databaseScaled
        ? [{ id: 'database', label: 'PostgreSQL primário · 2× capacidade · +US$ 0,24/h' }]
        : []),
      ...(run.system.replica && !run.system.replicaScaled
        ? [{ id: 'replica', label: 'Réplica · 2× capacidade · +US$ 0,18/h' }]
        : []),
      ...((run.system.cache || run.system.caches.length) && !run.system.cacheScaled
        ? [{ id: 'cache', label: 'Cache · mais memória · +US$ 0,06/h' }]
        : []),
    ],
    restart: nodes,
    'stop-import': operations.filter(
      (operation) => !run.system.stoppedOperations.includes(operation.id),
    ),
    'resume-operation': operations.filter((operation) =>
      run.system.stoppedOperations.includes(operation.id),
    ),
  };
}

export function configureInstrumentation(run: Run, metric: InstrumentId, enabled: boolean) {
  if (run.status !== 'active') throw new Error('Esta investigação foi encerrada.');
  if (run.record.difficulty !== 'free')
    throw new Error('A instrumentação já está disponível no modo guiado.');
  const item = instruments.find((item) => item.id === metric);
  if (!item || typeof enabled !== 'boolean') throw new Error('Instrumentação inválida.');
  if (run.pending || run.instrumentationPending)
    throw new Error('Aguarde a conclusão da alteração atual.');
  if (run.instrumentation.includes(metric) === enabled)
    throw new Error('Esta instrumentação já está neste estado.');
  if (run.record.decisions.length >= 200) throw new Error('Limite de decisões atingido.');
  run.record.decisions.push({ kind: 'instrumentation', metric, enabled, at: run.record.elapsed });
  if (enabled) {
    run.instrumentationPending = { metric, completesAt: run.record.elapsed + item.seconds };
    run.scheduled.push({
      at: run.instrumentationPending.completesAt,
      kind: 'instrumentation',
      priority: 0,
    });
    run.scheduled.sort((a, b) => a.at - b.at || a.priority - b.priority);
  } else {
    run.instrumentation = run.instrumentation.filter((id) => id !== metric);
    if (metric === 'database-sessions') run.sessionsInspected = false;
    run.metrics = measure(run, false);
  }
  run.events.push({
    at: run.record.elapsed,
    kind: 'action',
    message: `${item.name}: ${enabled ? `instrumentação iniciada (${item.seconds}s)` : 'coleta desativada; overhead removido'}`,
  });
}

function backgroundWork(run: Run) {
  const scenario = getScenario(run.record.scenarioId);
  if (
    run.system.stoppedOperations.includes('orders-reconciliation') ||
    run.record.elapsed < run.system.backgroundResumeAt
  )
    return 0;
  if (
    run.pending?.action === 'restart' &&
    ['database', 'reconciliation-worker'].includes(run.pending.target ?? '')
  )
    return 0;
  return scenario.incident.backgroundWork;
}

function endpointWork(run: Run, index: number) {
  const scenario = getScenario(run.record.scenarioId);
  return (
    scenario.endpoints[index].work *
    (index === 0 && run.system.regression ? scenario.incident.productWork : 1) *
    (index === 2 && run.system.checkoutRegression ? scenario.incident.checkoutWorkMultiplier : 1) *
    (scenario.endpoints[index].path === scenario.incident.queryEndpoint && run.system.regression
      ? scenario.incident.queryWorkMultiplier
      : 1)
  );
}

function endpointLatency(run: Run, index: number, affectedProduct = true, processLocked = false) {
  const scenario = getScenario(run.record.scenarioId);
  if (endpointRestartShare(run, index) >= 0.05) return 5000 + overhead(run).latency;
  const endpoint = scenario.endpoints[index];
  const checkoutDelay =
    (index === 2 && run.system.checkoutRegression ? scenario.incident.checkoutDelayMs : 0) +
    (index === 2 && run.system.stoppedOperations.includes('receipt-delivery') ? 120 : 0) +
    overhead(run).latency;
  if (index === 2 && run.system.stoppedOperations.includes('checkout-processing'))
    return 5000 + checkoutDelay;
  if (
    ((scenario.incident.kind === 'row-lock' && run.system.regression && affectedProduct) ||
      processLocked) &&
    index === 2
  )
    return (run.system.lockTimeout ? 1000 : 5000) + checkoutDelay;
  const work = endpointWork(run, index) * (1 - cacheReduction(run, endpoint.path));
  const capacity = scenario.databaseCapacity * (run.system.databaseScaled ? 2 : 1);
  const readReplica = run.system.replica && endpoint.path.startsWith('GET ');
  const wait = readReplica
    ? Math.max(
        run.system.queue / capacity,
        run.system.replicaQueue / (scenario.databaseCapacity * (run.system.replicaScaled ? 2 : 1)),
      )
    : run.system.queue / capacity;
  return Math.round(
    105 +
      (wait + (work * 40) / (readReplica ? scenario.databaseCapacity : capacity)) * 1000 +
      checkoutDelay,
  );
}

function checkoutBreakdown(run: Run) {
  const scenario = getScenario(run.record.scenarioId);
  const down = endpointRestartShare(run, 2);
  const penalized = run.record.elapsed < run.system.sessionPenaltyUntil;
  return (scenario.checkoutSegments ?? []).map((segment) => {
    const processLocked = segment.lockResource
      ? conflictingProcesses(run.processes, segment.lockResource.table, segment.lockResource.rowKey)
          .length > 0
      : false;
    return {
      sku: segment.sku,
      category: segment.category,
      share: segment.share,
      latency: endpointLatency(run, 2, segment.lockAffected, processLocked),
      errorRate:
        run.system.stoppedOperations.includes('checkout-processing') ||
        (run.system.regression && segment.lockAffected) ||
        processLocked
          ? 100
          : Math.max(down * 100, penalized ? 20 : 0),
    };
  });
}

function measure(run: Run, tick: boolean): Metrics {
  const scenario = getScenario(run.record.scenarioId);
  const { system } = run;
  const locked = scenario.incident.kind === 'row-lock' && system.regression;
  const rps = scenario.baselineRps * (0.96 + (tick ? sample(run) : 0.5) * 0.08);
  const work = scenario.endpoints.reduce(
    (sum, endpoint, i) =>
      sum + endpoint.share * endpointWork(run, i) * (1 - cacheReduction(run, endpoint.path)),
    0,
  );
  const capacity = scenario.databaseCapacity * (system.databaseScaled ? 2 : 1);
  const replicaCapacity = scenario.databaseCapacity * (system.replicaScaled ? 2 : 1);
  const down = restartShare(run);
  const demand =
    rps * work * (1 - down) +
    overhead(run).databaseWork +
    system.indexes.length * 15 +
    backgroundWork(run) +
    databaseWork(run.processes);
  const writeDemand = scenario.endpoints.reduce(
    (sum, e, i) =>
      sum +
      (e.path.startsWith('GET ')
        ? 0
        : rps * e.share * endpointWork(run, i) * (1 - cacheReduction(run, e.path)) * (1 - down)),
    0,
  );
  const replicaDemand = system.replica
    ? Math.max(
        0,
        demand -
          writeDemand -
          overhead(run).databaseWork -
          system.indexes.length * 15 -
          backgroundWork(run) -
          databaseWork(run.processes),
      ) / 2
    : 0;
  const primaryDemand = demand - replicaDemand;
  const maxQueue = capacity * (system.pool / 40) * 3;
  const maxReplicaQueue = replicaCapacity * (system.pool / 40) * 3;
  const queued = Math.max(0, system.queue + primaryDemand - capacity);
  const replicaQueued = system.replica
    ? Math.max(0, system.replicaQueue + replicaDemand - replicaCapacity)
    : 0;
  const discarded = tick
    ? Math.max(0, queued - maxQueue) + Math.max(0, replicaQueued - maxReplicaQueue)
    : Math.max(0, primaryDemand - capacity);
  if (tick) {
    system.queue = Math.min(maxQueue, queued);
    system.replicaQueue = Math.min(maxReplicaQueue, replicaQueued);
  }
  const wait = Math.max(system.queue / capacity, system.replicaQueue / replicaCapacity);
  const segments = checkoutBreakdown(run);
  const distribution = scenario.endpoints
    .flatMap((e, i) =>
      i === 2 && segments.length
        ? segments.map((segment) => ({ share: e.share * segment.share, latency: segment.latency }))
        : [{ share: e.share, latency: endpointLatency(run, i) }],
    )
    .sort((a, b) => a.latency - b.latency);
  const checkoutErrors = segments.reduce(
    (sum, segment) => sum + segment.share * segment.errorRate,
    0,
  );
  const operationErrors = scenario.endpoints.reduce(
    (sum, endpoint, index) =>
      sum +
      endpoint.share *
        (index === 2 && system.stoppedOperations.includes('checkout-processing')
          ? 100
          : index === 2 && segments.length
            ? checkoutErrors
            : index === 2 &&
                scenario.incident.kind === 'workload-contention' &&
                run.record.elapsed < system.sessionPenaltyUntil
              ? Math.max(20, endpointRestartShare(run, index) * 100)
              : index === 3 && run.record.elapsed < system.interruptedReadUntil
                ? Math.max(20, endpointRestartShare(run, index) * 100)
                : endpointRestartShare(run, index) * 100),
    0,
  );
  let cumulative = 0;
  const latency = distribution.find((endpoint) => {
    cumulative += endpoint.share;
    return cumulative >= 0.95;
  })!.latency;
  return {
    rps: Math.round(rps),
    latency,
    errorRate:
      down === 1
        ? 100
        : Math.min(100, Math.max(operationErrors, (discarded / Math.max(1, demand)) * 100)),
    apiUtilization:
      down === 1 ? 0 : Math.min(100, (rps / (scenario.apiCapacity * system.apiInstances)) * 100),
    databaseUtilization: Math.min(
      100,
      Math.max(
        primaryDemand / capacity,
        replicaDemand / replicaCapacity,
        system.queue > 0 || system.replicaQueue > 0 ? 1 : 0,
      ) * 100,
    ),
    queue: Math.round(system.queue + system.replicaQueue),
    connections: Math.min(
      system.pool,
      Math.ceil(
        8 +
          wait * 12 +
          (locked
            ? system.pool *
              0.8 *
              (1 - endpointRestartShare(run, 2)) *
              (system.lockTimeout ? 0.2 : 1)
            : 0),
      ),
    ),
    hourlyCost:
      0.28 +
      (system.cache ? 0.06 : 0) +
      system.caches.length * 0.06 +
      system.indexes.length * 0.01 +
      (system.replica ? 0.18 : 0) +
      (system.apiInstances - 1) * 0.12 +
      (system.databaseScaled ? 0.24 : 0) +
      (system.replicaScaled ? 0.18 : 0) +
      (system.cacheScaled ? 0.06 : 0) +
      overhead(run).hourlyCost,
  };
}

export function createRun(
  seed = 42,
  difficulty: Difficulty = 'guided',
  scenarioId = scenarioCatalog[0].id,
): Run {
  const scenario = getScenario(scenarioId);
  const record = recordSchema.parse({
    engineVersion: ENGINE_VERSION,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    seed,
    difficulty,
    elapsed: 0,
    decisions: [],
  });
  const run: Run = {
    record,
    processes: createProcesses(scenario.processes ?? []),
    status: 'active',
    random: seed,
    system: {
      regression: true,
      cache: false,
      replica: false,
      apiInstances: 1,
      pool: 40,
      queue: scenario.incident.kind === 'row-lock' ? 0 : 2600,
      replicaQueue: 0,
      databaseScaled: false,
      catalogIndex: false,
      lockTimeout: false,
      idleTimeout: false,
      checkoutRegression: scenario.incident.kind === 'row-lock',
      sessionPenaltyUntil: 0,
      incorrectKills: 0,
      backgroundResumeAt: 0,
      backgroundAttempts: 0,
      interruptedReadUntil: 0,
      caches: [],
      indexes: [],
      optimized: [],
      appliedTargets: [],
      stoppedOperations: [],
      replicaScaled: false,
      cacheScaled: false,
    },
    instrumentation: [],
    instrumentationPending: null,
    sessionsInspected: false,
    abortedCheckouts: 0,
    pending: null,
    completed: [],
    interventionEvidence: [],
    metrics: {} as Metrics,
    history: [],
    logs: scenario.initialLogs
      ? structuredClone(scenario.initialLogs)
      : [
          {
            at: -30,
            kind: 'WARN',
            message:
              'catalog query duration=2410ms rows_examined=48000 sort=created_at plan=SeqScan',
          },
          {
            at: -20,
            kind: 'ERROR',
            message: 'POST /checkout status=504 reason=database_connection_wait timeout=3000ms',
          },
          {
            at: -10,
            kind: 'INFO',
            message:
              'traffic_summary requests_per_second=300 baseline=300 payment_gateway_p95=82ms',
          },
        ],
    events: scenario.initialEvents
      ? structuredClone(scenario.initialEvents)
      : [
          {
            at: -600,
            kind: 'baseline',
            message: 'Operação normal: 300 req/s · p95 120 ms · erros 0,1%',
          },
          {
            at: -120,
            kind: 'deploy',
            message: 'Versão v2.14.0 implantada · ordenação do catálogo e melhorias na loja',
          },
          {
            at: -45,
            kind: 'alert',
            message: 'Alerta: latência p95 acima de 800 ms; espera por conexões do banco em alta',
          },
          {
            at: -15,
            kind: 'customer',
            message: '“As páginas de produtos estão lentas. Não consigo finalizar minha compra.”',
          },
        ],
    hypotheses: [],
    stableSeconds: 0,
    failedRequests: 0,
    totalRequests: 0,
    cost: 0,
    scheduled: [{ at: 1, kind: 'sample', priority: 1 }],
  };
  if (difficulty === 'free')
    run.logs = run.logs.filter(
      (log) => !/sku=|skus=|plan=|rows_examined=|wait_event=|pricing_query=/.test(log.message),
    );
  run.metrics = measure(run, false);
  run.history.push({
    at: 0,
    latency: run.metrics.latency,
    errors: run.metrics.errorRate,
    database: run.metrics.databaseUtilization,
  });
  return run;
}

export function intervene(run: Run, id: ActionId, targetPid?: number, target?: string) {
  if (run.status !== 'active')
    throw new Error('Este incidente foi encerrado. Inicie uma nova partida para experimentar.');
  if (run.pending || run.instrumentationPending)
    throw new Error('Aguarde a conclusão da intervenção atual.');
  const action = availableActions(run.record.difficulty, run.record.scenarioId).find(
    (a) => a.id === id,
  );
  if (!action) throw new Error('Esta intervenção não está disponível neste modo.');
  if (
    id === 'terminate-session' &&
    (!run.sessionsInspected || !sessionDetails(run).some((session) => session.pid === targetPid))
  )
    throw new Error('Consulte as sessões e selecione um PID disponível.');
  if (id !== 'terminate-session' && targetPid !== undefined)
    throw new Error('Esta intervenção não aceita um PID.');
  const targeted = requiresActionTarget(run.record.difficulty, id, run.record.scenarioId);
  const targets = actionTargets(run);
  if (targeted && !(targets[id as keyof typeof targets] ?? []).some((item) => item.id === target))
    throw new Error('Escolha um alvo disponível para esta intervenção.');
  if (!targeted && target !== undefined) throw new Error('Esta intervenção não aceita um alvo.');
  if (
    targeted &&
    !['restart', 'scale-api', 'stop-import', 'resume-operation'].includes(id) &&
    run.system.appliedTargets.includes(`${id}:${target}`)
  )
    throw new Error('Esta intervenção já foi aplicada neste alvo.');
  if (id !== 'terminate-session' && !targeted && run.completed.includes(id))
    throw new Error('Esta intervenção já foi aplicada.');
  if (run.record.decisions.length >= 200) throw new Error('Limite de decisões atingido.');
  run.record.decisions.push({
    kind: 'action',
    at: run.record.elapsed,
    action: id,
    ...(targetPid === undefined ? {} : { targetPid }),
    ...(target === undefined ? {} : { target }),
  });
  run.interventionEvidence.push({
    at: run.record.elapsed,
    completesAt: run.record.elapsed + action.seconds,
    before: {
      latency: run.metrics.latency,
      errors: run.metrics.errorRate,
      queue: run.metrics.queue,
    },
    after: null,
    followUp: null,
  });
  run.pending = {
    action: id,
    completesAt: run.record.elapsed + action.seconds,
    ...(targetPid === undefined ? {} : { targetPid }),
    ...(target === undefined ? {} : { target }),
  };
  if (id === 'restart' && target === 'database') run.abortedCheckouts += 2;
  run.scheduled.push({ at: run.pending.completesAt, kind: 'complete', priority: 0 });
  run.scheduled.sort((a, b) => a.at - b.at || a.priority - b.priority);
  run.events.push({
    at: run.record.elapsed,
    kind: 'action',
    message: `${action.name}${target ? ` · ${target}` : ''}${targetPid === undefined ? '' : ` · PID ${targetPid}`} iniciada; duração estimada: ${action.seconds}s`,
  });
}

function complete(run: Run) {
  const id = run.pending!.action;
  const target = run.pending!.target;
  const targeted = target !== undefined;
  if (targeted) run.system.appliedTargets.push(`${id}:${target}`);
  const scenario = getScenario(run.record.scenarioId);
  if (id === 'rollback') run.system.checkoutRegression = false;
  if (id === 'terminate-session') {
    const pid = run.pending!.targetPid!;
    const processTerminated = terminateProcess(run.processes, pid, run.record.elapsed);
    if (processTerminated) {
      run.events.push({
        at: run.record.elapsed,
        kind: 'alert',
        message: `Sessão ${pid} encerrada; transação desfeita.`,
      });
    } else if (
      scenario.incident.kind === 'workload-contention' &&
      pid === 610 + run.system.backgroundAttempts
    ) {
      run.system.backgroundResumeAt = run.record.elapsed + 45;
      run.system.backgroundAttempts++;
      run.events.push({
        at: run.record.elapsed,
        kind: 'job',
        message: 'Execução r17 cancelada; agendador programou nova tentativa em 45s.',
      });
    } else if (scenario.incident.kind === 'workload-contention' && pid === 818) {
      run.system.interruptedReadUntil = run.record.elapsed + 30;
      run.failedRequests++;
      run.totalRequests++;
      run.events.push({
        at: run.record.elapsed,
        kind: 'alert',
        message: 'Consulta de pedidos interrompida; falhas de leitura durante 30s de reconexão.',
      });
    } else if (pid === 731) run.system.regression = false;
    else {
      run.abortedCheckouts++;
      run.failedRequests++;
      run.totalRequests++;
      run.system.incorrectKills++;
      run.system.sessionPenaltyUntil = run.record.elapsed + 30;
      run.events.push({
        at: run.record.elapsed,
        kind: 'alert',
        message: `Compra abortada ao encerrar PID ${pid}; falhas adicionais durante 30 segundos de reconexão.`,
      });
    }
    run.logs.push({
      at: run.record.elapsed,
      kind: 'WARN',
      message: `db_session pid=${pid} terminated rollback=true${processTerminated ? '' : pid === 731 ? ' connection_tag=c-6f2' : scenario.incident.kind === 'workload-contention' && (pid === 818 || pid === 609 + run.system.backgroundAttempts) ? ' checkout_aborted=false' : ' checkout_aborted=true reconnect_window=30s'}`,
    });
  }
  if (
    scenario.incident.kind === 'query-regression' &&
    (id === 'rollback' || (id === 'optimize-query' && (!targeted || target === 'catalog-list')))
  )
    run.system.regression = false;
  if (
    id === 'stop-import' &&
    scenario.incident.kind === 'row-lock' &&
    (!targeted || target === 'inventory-sync')
  ) {
    run.system.regression = false;
    run.events.push({
      at: run.record.elapsed,
      kind: 'alert',
      message: 'Lote da importação desfeito; reprocessamento necessário.',
    });
  }
  if (id === 'stop-import' && target) {
    stopProcess(run.processes, target);
    run.system.stoppedOperations.push(target);
    if (target === 'orders-reconciliation')
      run.events.push({
        at: run.record.elapsed,
        kind: 'alert',
        message:
          'Execução r17 e próximas tentativas suspensas; fechamento diário pendente de reprocessamento.',
      });
  }
  if (id === 'resume-operation') {
    if (target) resumeProcess(run.processes, target);
    run.system.stoppedOperations = run.system.stoppedOperations.filter(
      (operation) => operation !== target,
    );
  }
  if (id === 'restart' && (target === 'database' || target === 'inventory-worker')) {
    if (scenario.incident.kind === 'row-lock') run.system.regression = false;
    run.events.push({
      at: run.record.elapsed,
      kind: 'alert',
      message: `Reinício de ${target}: transações desfeitas${scenario.incident.kind === 'row-lock' ? '; lote de estoque exige reprocessamento' : '; operações em andamento foram interrompidas'}.`,
    });
  }
  if (id === 'optimize-query' && target) {
    run.system.optimized.push(target);
    if (target === 'checkout-pricing') run.system.checkoutRegression = false;
    if (scenario.incident.kind === 'workload-contention' && target === 'customer-orders')
      run.system.regression = false;
  }
  if (id === 'cache') {
    if (target) run.system.caches.push(target);
    else run.system.cache = true;
  }
  if (id === 'replica') run.system.replica = true;
  if (id === 'scale-api') {
    if (!target || target === 'api') run.system.apiInstances++;
    if (target === 'database') run.system.databaseScaled = true;
    if (target === 'replica') run.system.replicaScaled = true;
    if (target === 'cache') run.system.cacheScaled = true;
  }
  if (id === 'pool') run.system.pool = 80;
  if (id === 'scale-db') run.system.databaseScaled = true;
  if (id === 'lock-timeout') run.system.lockTimeout = true;
  if (id === 'idle-timeout') run.system.idleTimeout = true;
  if (id === 'create-index') {
    if (target) run.system.indexes.push(target);
    if (!target || target === 'catalog-list') {
      run.system.catalogIndex = true;
      if (scenario.incident.kind === 'query-regression') run.system.regression = false;
    }
    if (target === 'checkout-pricing') run.system.checkoutRegression = false;
    if (scenario.incident.kind === 'workload-contention' && target === 'customer-orders')
      run.system.regression = false;
  }
  run.completed.push(id);
  run.pending = null;
  run.events.push({
    at: run.record.elapsed,
    kind: 'complete',
    message: `${availableActions(run.record.difficulty, run.record.scenarioId).find((a) => a.id === id)!.name}${target ? ` · ${target}` : ''} concluída`,
  });
}

export function advance(run: Run, seconds: number) {
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 3600)
    throw new Error('O tempo deve ser um número inteiro entre 0 e 3600 segundos.');
  const target = Math.min(3600, run.record.elapsed + seconds);
  while (run.status === 'active' && run.scheduled.length && run.scheduled[0].at <= target) {
    const event = run.scheduled.shift()!;
    run.record.elapsed = event.at;
    if (event.kind === 'instrumentation') {
      const metric = run.instrumentationPending!.metric;
      run.instrumentation.push(metric);
      run.instrumentationPending = null;
      run.events.push({
        at: run.record.elapsed,
        kind: 'complete',
        message: `${instruments.find((item) => item.id === metric)!.name}: coleta ativa; overhead aplicado.`,
      });
      continue;
    }
    if (event.kind === 'complete') {
      complete(run);
      continue;
    }
    advanceProcesses(run.processes, run.record.elapsed);
    if (
      run.system.idleTimeout &&
      run.system.regression &&
      getScenario(run.record.scenarioId).incident.kind === 'row-lock' &&
      run.record.elapsed + 90 >= 180
    ) {
      run.system.regression = false;
      run.logs.push({
        at: run.record.elapsed,
        kind: 'WARN',
        message:
          'db_session pid=731 terminated reason=idle_in_transaction_session_timeout rollback=true',
      });
      run.events.push({
        at: run.record.elapsed,
        kind: 'complete',
        message: 'Sessão 731 encerrada pelo limite de inatividade; transação desfeita.',
      });
    }
    if (
      getScenario(run.record.scenarioId).incident.kind === 'workload-contention' &&
      run.record.elapsed === run.system.backgroundResumeAt &&
      backgroundWork(run) > 0
    ) {
      run.events.push({
        at: run.record.elapsed,
        kind: 'job',
        message: `Execução r17 retomada pelo agendador; tentativa ${run.system.backgroundAttempts + 1}.`,
      });
    }
    run.metrics = measure(run, true);
    const evidence = run.interventionEvidence.find(
      (item) => item.completesAt === run.record.elapsed,
    );
    if (evidence)
      evidence.after = {
        latency: run.metrics.latency,
        errors: run.metrics.errorRate,
        queue: run.metrics.queue,
      };
    const latest = run.interventionEvidence[run.interventionEvidence.length - 1];
    if (
      latest?.after &&
      run.record.elapsed <= latest.completesAt + 60 &&
      !run.record.decisions.some(
        (decision) =>
          (decision.kind === 'action' || decision.kind === 'instrumentation') &&
          decision.at >= latest.completesAt,
      )
    ) {
      latest.followUp = {
        at: run.record.elapsed,
        latency: run.metrics.latency,
        errors: run.metrics.errorRate,
        queue: run.metrics.queue,
      };
    }
    run.totalRequests += run.metrics.rps;
    run.failedRequests += (run.metrics.rps * run.metrics.errorRate) / 100;
    run.cost += run.metrics.hourlyCost / 3600;
    run.history.push({
      at: run.record.elapsed,
      latency: run.metrics.latency,
      errors: run.metrics.errorRate,
      database: run.metrics.databaseUtilization,
    });
    if (run.history.length > 1800) run.history.shift();
    if (run.record.elapsed % 10 === 0) {
      const slow = run.metrics.latency >= 800;
      const lockingIncident = getScenario(run.record.scenarioId).incident.kind === 'row-lock';
      if (!hasInstrument(run, 'detailed-logs')) {
        run.logs.push({
          at: run.record.elapsed,
          kind: run.metrics.errorRate > 1 ? 'WARN' : 'INFO',
          message: `request_summary requests_per_second=${run.metrics.rps} p95=${run.metrics.latency}ms errors=${run.metrics.errorRate.toFixed(1)}%`,
        });
      } else if (lockingIncident) {
        const locked = run.system.regression;
        for (const segment of checkoutBreakdown(run))
          run.logs.push({
            at: run.record.elapsed,
            kind: segment.errorRate > 0 ? 'WARN' : 'INFO',
            message: `POST /checkout sku=${segment.sku} category=${segment.category} p95=${segment.latency}ms errors=${segment.errorRate}% pricing_query=${run.system.checkoutRegression ? 204 : 24}ms payment_gateway_p95=82ms`,
          });
        if (locked)
          run.logs.push({
            at: run.record.elapsed,
            kind: 'INFO',
            message: `db_summary idle_in_transaction=1 lock_wait_ms=${run.system.lockTimeout ? 1000 : 5000} connections=${run.metrics.connections}/${run.system.pool}`,
          });
      } else if (getScenario(run.record.scenarioId).incident.kind === 'workload-contention') {
        run.logs.push({
          at: run.record.elapsed,
          kind: slow ? 'WARN' : 'INFO',
          message: `GET /orders p95=${endpointLatency(run, 3)}ms plan=${run.system.regression ? 'SeqScan' : 'IndexScan'} rows_examined=${run.system.regression ? 240000 : 20} connection_tag=c-web-18`,
        });
        run.logs.push({
          at: run.record.elapsed,
          kind: 'INFO',
          message: `job_progress run_id=r17 connection_tag=c-r17 stage=historical_totals active=${backgroundWork(run) > 0} db_work_per_second=${backgroundWork(run)} idle_in_transaction=0 lock_wait_ms=0`,
        });
      } else
        run.logs.push({
          at: run.record.elapsed,
          kind: slow ? 'WARN' : 'INFO',
          message: `GET /products p95=${run.metrics.latency}ms plan=${run.system.regression ? 'SeqScan' : 'IndexScan'} rows_examined=${run.system.regression ? 48000 : 120} db_queue=${run.metrics.queue} cache=${run.system.cache ? `${Math.round(cacheHitRate(run, 'GET /products') * 100)}% estimated hit` : 'off'}`,
        });
      if (run.metrics.errorRate > 1)
        run.logs.push({
          at: run.record.elapsed,
          kind: 'ERROR',
          message: `POST /checkout upstream_timeout errors=${run.metrics.errorRate.toFixed(1)}% pool=${run.metrics.connections}/${run.system.pool}`,
        });
    }
    run.stableSeconds =
      run.metrics.latency < 800 && run.metrics.errorRate < 1 ? run.stableSeconds + 1 : 0;
    if (run.stableSeconds >= 60 && !run.pending && !run.instrumentationPending) {
      run.status = 'resolved';
      run.events.push({
        at: run.record.elapsed,
        kind: 'recovered',
        message:
          'Serviço recuperado: latência e erros dentro das metas por 60 segundos consecutivos.',
      });
    } else if (run.record.elapsed >= 3600) {
      run.status = 'ended';
      run.events.push({
        at: run.record.elapsed,
        kind: 'ended',
        message: 'A janela de 60 minutos do incidente foi encerrada.',
      });
    }
    if (run.status === 'active') {
      run.scheduled.push({ at: run.record.elapsed + 1, kind: 'sample', priority: 1 });
      run.scheduled.sort((a, b) => a.at - b.at || a.priority - b.priority);
    }
  }
}

export function addHypothesis(run: Run, text: string) {
  if (run.status !== 'active') throw new Error('Este incidente foi encerrado.');
  const decision = decisionSchema.parse({ kind: 'hypothesis', at: run.record.elapsed, text });
  if (decision.kind !== 'hypothesis') return;
  if (run.record.decisions.length >= 200) throw new Error('Limite de decisões atingido.');
  run.hypotheses.push({ at: decision.at, text: decision.text });
  run.record.decisions.push(decision);
}

export function finish(run: Run) {
  if (run.status !== 'active') return;
  if (run.record.decisions.length >= 200) throw new Error('Limite de decisões atingido.');
  run.record.decisions.push({ kind: 'finish', at: run.record.elapsed });
  run.status = 'ended';
  run.events.push({
    at: run.record.elapsed,
    kind: 'ended',
    message: 'Investigação encerrada pelo operador.',
  });
}

export interface DatabaseSession {
  pid: number;
  application: string;
  user: string;
  connectionTag: string;
  state: string;
  transactionAge: number;
  waitEvent: string;
  blockedBy: number | null;
  query: string;
}

function sessionDetails(run: Run): DatabaseSession[] {
  if (run.pending?.action === 'restart' && run.pending.target === 'database') return [];
  const scenario = getScenario(run.record.scenarioId);
  const locked = scenario.incident.kind === 'row-lock' && run.system.regression;
  const common = { application: 'mercado-worker', user: 'mercado_app' };
  return [
    ...run.processes
      .filter((process) => process.running)
      .map((process) => ({
        pid: process.definition.pid,
        application: process.definition.id,
        user: 'simulated',
        connectionTag: process.definition.id,
        state: 'active',
        transactionAge: run.record.elapsed,
        waitEvent: 'CPU',
        blockedBy: null,
        query: '',
      })),
    ...(scenario.incident.kind === 'workload-contention' && backgroundWork(run) > 0
      ? [
          {
            ...common,
            pid: 610 + run.system.backgroundAttempts,
            connectionTag: 'c-r17',
            state: 'active',
            transactionAge: run.system.backgroundAttempts
              ? run.record.elapsed - run.system.backgroundResumeAt
              : 300 + run.record.elapsed,
            waitEvent: 'IO: DataFileRead',
            blockedBy: null,
            query: "SELECT date_trunc('day', created_at), sum(total) FROM orders GROUP BY 1;",
          },
        ]
      : []),
    ...(scenario.incident.kind === 'workload-contention' &&
    endpointRestartShare(run, 3) < 1 &&
    run.record.elapsed >= run.system.interruptedReadUntil
      ? [
          {
            ...common,
            pid: 818,
            connectionTag: 'c-web-18',
            state: 'active',
            transactionAge: Math.ceil(endpointLatency(run, 3) / 1000),
            waitEvent: 'IO: DataFileRead',
            blockedBy: null,
            query: (run.system.regression
              ? scenario.endpoints[3].queries[0].incident!
              : scenario.endpoints[3].queries[0].normal
            ).sql,
          },
        ]
      : []),
    ...(locked
      ? [
          {
            ...common,
            pid: 731,
            connectionTag: 'c-6f2',
            state: 'idle in transaction',
            transactionAge: 95 + run.record.elapsed,
            waitEvent: 'Client: ClientRead',
            blockedBy: null,
            query: "UPDATE products SET stock = $1 WHERE id IN ('SKU-101', 'SKU-102');",
          },
        ]
      : []),
    ...(endpointRestartShare(run, 2) === 1 ||
    run.system.stoppedOperations.includes('checkout-processing')
      ? []
      : [
          ...(locked
            ? [
                {
                  ...common,
                  pid: 842,
                  connectionTag: 'c-web-42',
                  state: 'active',
                  transactionAge: run.system.lockTimeout ? 1 : 5,
                  waitEvent: 'Lock: transactionid',
                  blockedBy: 731,
                  query: "SELECT id, stock FROM products WHERE id = 'SKU-101' FOR UPDATE;",
                },
              ]
            : []),
          ...(run.record.elapsed < run.system.sessionPenaltyUntil
            ? []
            : [
                {
                  ...common,
                  pid: 904 + run.system.incorrectKills,
                  connectionTag: 'c-web-04',
                  state: 'active',
                  transactionAge: 1,
                  waitEvent: 'IO: WALWrite',
                  blockedBy: null,
                  query: "INSERT INTO orders (product_id, status) VALUES ('SKU-201', 'confirmed');",
                },
              ]),
        ]),
  ];
}

export function inspectSessions(run: Run) {
  if (run.status !== 'active') throw new Error('Esta investigação foi encerrada.');
  if (!hasInstrument(run, 'database-sessions'))
    throw new Error('Implemente a instrumentação de sessões do banco antes de consultar.');
  if (!run.sessionsInspected) {
    if (run.record.decisions.length >= 200) throw new Error('Limite de decisões atingido.');
    run.record.decisions.push({ kind: 'inspection', at: run.record.elapsed });
    run.sessionsInspected = true;
  }
}

export function observe(run: Run) {
  const scenario = getScenario(run.record.scenarioId);
  const locked = scenario.incident.kind === 'row-lock' && run.system.regression;
  const segments = checkoutBreakdown(run);
  const checkoutErrors = segments.reduce(
    (sum, segment) => sum + segment.share * segment.errorRate,
    0,
  );
  return {
    elapsed: run.record.elapsed,
    status: run.status,
    metrics: { ...run.metrics },
    history: run.history,
    endpoints: scenario.endpoints.map((endpoint, i) => ({
      path: endpoint.path,
      rps: Math.round(run.metrics.rps * endpoint.share),
      latency: endpointLatency(run, i),
      errorRate:
        i === 2 && run.system.stoppedOperations.includes('checkout-processing')
          ? 100
          : i === 2 && segments.length && scenario.processes?.length
            ? Math.max(endpointRestartShare(run, i) * 100, checkoutErrors)
            : scenario.incident.kind === 'row-lock'
              ? Math.max(endpointRestartShare(run, i) * 100, i === 2 ? checkoutErrors : 0)
              : restartShare(run) > 0
                ? endpointRestartShare(run, i) * 100
                : run.system.stoppedOperations.includes('checkout-processing')
                  ? 0
                  : run.metrics.errorRate,
      dependency: 'PostgreSQL',
      queries: endpoint.queries.map((query) => ({ id: query.id, name: query.name })),
    })),
    logs: run.logs,
    events: run.events,
    hypotheses: run.hypotheses,
    pending: run.pending,
    completed: run.completed,
    database: hasInstrument(run, 'database-sessions')
      ? {
          activeConnections: Math.max(0, run.metrics.connections - (locked ? 1 : 0)),
          idleInTransaction: locked ? 1 : 0,
          lockWaitMs:
            locked && endpointRestartShare(run, 2) < 1 ? (run.system.lockTimeout ? 1000 : 5000) : 0,
        }
      : null,
    databaseSessions:
      hasInstrument(run, 'database-sessions') && run.sessionsInspected ? sessionDetails(run) : null,
    checkoutBreakdown: hasInstrument(run, 'checkout-dimensions') ? segments : [],
    instrumentation: {
      enabled: run.instrumentation,
      pending: run.instrumentationPending,
      overhead: overhead(run),
    },
    actionTargets: actionTargets(run),
    appliedTargets: run.system.appliedTargets,
    abortedCheckouts: run.abortedCheckouts,
    stableSeconds: run.stableSeconds,
    topology: {
      caches: run.system.caches.map((endpoint) => ({
        endpoint,
        hitRate: cacheHitRate(run, endpoint),
      })),
      catalogCacheHitRate: run.system.cache ? cacheHitRate(run, 'GET /products') : 0,
      indexes: run.system.indexes,
      stoppedOperations: run.system.stoppedOperations,
      replicaScaled: run.system.replicaScaled,
      cacheScaled: run.system.cacheScaled,
      apiInstances: run.system.apiInstances,
      cache: run.system.cache,
      replica: run.system.replica,
      pool: run.system.pool,
      databaseCapacity: scenario.databaseCapacity * (run.system.databaseScaled ? 2 : 1),
      lockTimeout: run.system.lockTimeout,
      idleTimeout: run.system.idleTimeout,
    },
  };
}
export type Observation = ReturnType<typeof observe>;

export function explainQuery(run: Run, endpointPath: string, queryId: string) {
  if (!hasInstrument(run, 'query-plans'))
    throw new Error('Implemente a instrumentação de planos de execução antes de consultar.');
  const scenario = getScenario(run.record.scenarioId);
  const index = scenario.endpoints.findIndex((endpoint) => endpoint.path === endpointPath);
  const endpoint = scenario.endpoints[index];
  const query = endpoint?.queries.find((candidate) => candidate.id === queryId);
  if (!query) throw new Error('Consulta não encontrada para este endpoint.');
  const affected =
    (index === 0 && run.system.regression && !!query.incident) ||
    (index === 2 && run.system.checkoutRegression && !!query.incident) ||
    (endpoint.path === scenario.incident.queryEndpoint && run.system.regression);
  const expressionIndex =
    scenario.incident.kind === 'workload-contention' &&
    run.system.indexes.includes(queryId) &&
    !run.system.optimized.includes(queryId)
      ? query.indexed
      : undefined;
  const usesCreatedIndex =
    run.system.catalogIndex &&
    !run.completed.includes('rollback') &&
    !run.system.optimized.includes('catalog-list') &&
    !(run.record.difficulty === 'guided' && run.completed.includes('optimize-query'));
  const pricingIndex =
    query.id === 'checkout-pricing' &&
    run.system.indexes.includes(query.id) &&
    !run.completed.includes('rollback') &&
    !run.system.optimized.includes(query.id);
  const variant =
    expressionIndex ??
    (pricingIndex
      ? {
          sql: query.incident!.sql,
          plan: 'Index Scan using price_rules_product_text_idx on price_rules  (cost=0.29..8.31 rows=1 width=8)\n  Index Cond: ((product_id)::text = ($1)::text)',
        }
      : affected && query.incident
        ? query.incident
        : usesCreatedIndex && index === 0 && query.indexed
          ? query.indexed
          : query.normal);
  return {
    at: run.record.elapsed,
    endpoint: endpointPath,
    queryId,
    sql: variant.sql,
    text: variant.plan,
    workUnits: endpointWork(run, index),
  };
}
export type QueryPlan = ReturnType<typeof explainQuery>;

const inferredHypotheses: Record<ActionId, string> = {
  rollback: 'O deploy recente pode contribuir para o incidente.',
  'optimize-query': 'O formato da consulta pode estar aumentando o trabalho no banco.',
  cache: 'Leituras repetidas podem estar pressionando o banco neste endpoint.',
  replica: 'Distribuir leituras pode aliviar a carga no banco primário.',
  'scale-api': 'A capacidade do componente escolhido pode estar limitando o serviço.',
  pool: 'O limite de conexões pode estar restringindo o processamento.',
  restart: 'Um estado transitório ou uma transação no nó escolhido pode manter o problema.',
  'stop-import': 'A operação interrompida pode contribuir para o incidente.',
  'resume-operation': 'A operação interrompida pode ser retomada para restaurar seu processamento.',
  'create-index': 'O acesso aos dados pode precisar de um índice para reduzir o trabalho.',
  'scale-db': 'A capacidade de processamento do banco pode estar limitando o serviço.',
  'lock-timeout': 'Esperas longas por bloqueios podem estar ocupando conexões.',
  'idle-timeout': 'Uma transação ociosa pode estar mantendo recursos bloqueados.',
  'terminate-session':
    'A sessão escolhida pode estar mantendo a transação responsável pelas esperas.',
};

export function report(run: Run) {
  const scenario = getScenario(run.record.scenarioId);
  return {
    inferences: run.record.decisions.flatMap((decision) => {
      if (decision.kind !== 'action') return [];
      const action = availableActions(run.record.difficulty, run.record.scenarioId).find(
        (action) => action.id === decision.action,
      )!;
      const completesAt = decision.at + action.seconds;
      const completed = completesAt <= run.record.elapsed;
      const { before, after, followUp } = run.interventionEvidence.find(
        (item) => item.at === decision.at,
      )!;
      const observationEndedByChange = run.record.decisions.some(
        (change) =>
          (change.kind === 'action' || change.kind === 'instrumentation') &&
          change.at >= completesAt &&
          change.at < completesAt + 60,
      );
      return [
        {
          at: decision.at,
          name: `${action.name}${decision.target ? ` · ${decision.target}` : ''}${decision.targetPid ? ` · PID ${decision.targetPid}` : ''}`,
          hypothesis:
            scenario.incident.kind === 'workload-contention' &&
            decision.action === 'terminate-session'
              ? 'A sessão escolhida pode estar consumindo capacidade necessária às requisições.'
              : inferredHypotheses[decision.action],
          completed,
          completesAt,
          before,
          after,
          followUp: followUp && followUp.at > completesAt ? followUp : null,
          observationEndedByChange,
        },
      ];
    }),
    finalMetrics: {
      at: run.record.elapsed,
      latency: run.metrics.latency,
      errors: run.metrics.errorRate,
      queue: run.metrics.queue,
      stableSeconds: run.stableSeconds,
    },
    rootCause: scenario.rootCause,
    explanation: scenario.explanation,
    alternatives: scenario.alternatives,
    instrumentation: { enabled: run.instrumentation, overhead: overhead(run) },
    stoppedOperations: run.system.stoppedOperations,
    timeline: run.events,
    hypotheses: run.hypotheses,
    failedRequests: Math.round(run.failedRequests),
    totalRequests: run.totalRequests,
    cost: run.cost,
    elapsed: run.record.elapsed,
    resolved: run.status === 'resolved',
    abortedCheckouts: run.abortedCheckouts,
    remainingIssues:
      scenario.incident.kind === 'workload-contention'
        ? [
            ...(run.system.regression
              ? [
                  'A consulta de pedidos ainda percorre linhas desnecessárias; a mitigação não corrigiu seu acesso aos dados.',
                ]
              : []),
            ...(!run.system.stoppedOperations.includes('orders-reconciliation')
              ? [
                  'A reconciliação histórica continua consumindo capacidade do primário; reprogramar ou isolar essa rotina após o incidente.',
                ]
              : []),
          ]
        : run.system.checkoutRegression
          ? [
              'A consulta de preços da v2.15.0 ainda acrescenta 180 ms ao checkout. O serviço pode cumprir as metas, mas essa regressão menor deve ser corrigida.',
            ]
          : [],
    repaired:
      !run.system.regression &&
      (scenario.incident.kind !== 'workload-contention' ||
        run.system.stoppedOperations.includes('orders-reconciliation')),
    hourlyCost: run.metrics.hourlyCost,
    risks: run.record.decisions.flatMap((decision) => {
      if (decision.kind !== 'action') return [];
      const action = availableActions(run.record.difficulty, run.record.scenarioId).find(
        (action) => action.id === decision.action,
      )!;
      if (decision.at + action.seconds > run.record.elapsed) return [];
      return [
        {
          name: `${action.name}${decision.target ? ` · ${decision.target}` : ''}${decision.targetPid ? ` · PID ${decision.targetPid}` : ''}`,
          tradeoff: action.tradeoff,
        },
      ];
    }),
  };
}
export type Report = ReturnType<typeof report>;

export function replay(input: RunRecord): Run {
  const record = recordSchema.parse(input);
  const run = createRun(record.seed, record.difficulty, record.scenarioId);
  for (const decision of record.decisions) {
    if (decision.at < run.record.elapsed || decision.at > record.elapsed)
      throw new Error('Ordem de decisões inválida.');
    advance(run, decision.at - run.record.elapsed);
    if (run.record.elapsed !== decision.at || run.status !== 'active')
      throw new Error('Decisão após o encerramento do incidente.');
    if (decision.kind === 'action')
      intervene(run, decision.action, decision.targetPid, decision.target);
    if (decision.kind === 'instrumentation')
      configureInstrumentation(run, decision.metric, decision.enabled);
    if (decision.kind === 'inspection') inspectSessions(run);
    if (decision.kind === 'hypothesis') addHypothesis(run, decision.text);
    if (decision.kind === 'finish') finish(run);
  }
  advance(run, record.elapsed - run.record.elapsed);
  if (run.record.elapsed !== record.elapsed) throw new Error('Tempo decorrido inválido.');
  return run;
}

export function restoreRun(json: string) {
  if (json.length > 150000) throw new Error('O registro salvo excede o tamanho permitido.');
  return replay(recordSchema.parse(JSON.parse(json)));
}
