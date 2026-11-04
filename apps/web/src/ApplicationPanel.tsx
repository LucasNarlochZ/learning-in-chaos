import { useState } from 'react';
import type { Observation, QueryPlan } from '../../../packages/sim-engine/src';
import type { Difficulty } from '../../../packages/educational-content/src';

interface Props {
  endpoints: Observation['endpoints'];
  plan: QueryPlan | null;
  busy: boolean;
  difficulty: Difficulty;
  fetchPlan(endpoint: string, queryId: string): void;
}

function timestamp(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function ApplicationPanel({ endpoints, plan, busy, difficulty, fetchPlan }: Props) {
  const [endpointPath, setEndpointPath] = useState(endpoints[0]?.path ?? '');
  const [queryId, setQueryId] = useState(endpoints[0]?.queries?.[0]?.id ?? '');
  const endpoint = endpoints.find((item) => item.path === endpointPath) ?? endpoints[0];
  const query = endpoint?.queries?.find((item) => item.id === queryId) ?? endpoint?.queries?.[0];

  if (!endpoint || !query)
    return (
      <section className="panel application-panel">
        <div className="panel-heading">
          <h2>Inspetor de consultas por endpoint</h2>
        </div>
        <div className="query-plan-empty" role="status">
          <h3>Atualizando as ferramentas da aplicação.</h3>
          <p>
            Esta sessão precisa das definições de consultas atualizadas. Recarregue para retomar a
            investigação salva.
          </p>
          <a className="primary" href={window.location.href}>
            Recarregar investigação
          </a>
        </div>
      </section>
    );

  const result = plan?.endpoint === endpoint.path && plan.queryId === query.id ? plan : null;

  return (
    <section className="panel application-panel">
      <div className="panel-heading">
        <h2>Inspetor de consultas por endpoint</h2>
        <span>POSTGRESQL · EXPLAIN SIMULADO</span>
      </div>
      <form
        className="query-plan-form"
        onSubmit={(event) => {
          event.preventDefault();
          fetchPlan(endpoint.path, query.id);
        }}
      >
        <label>
          Endpoint
          <select
            aria-label="Endpoint da aplicação"
            value={endpoint.path}
            onChange={(event) => {
              const next = endpoints.find((item) => item.path === event.target.value)!;
              setEndpointPath(next.path);
              setQueryId(next.queries?.[0]?.id ?? '');
            }}
          >
            {endpoints.map((item) => (
              <option key={item.path} value={item.path}>
                {item.path}
              </option>
            ))}
          </select>
        </label>
        <label>
          Consulta
          <select
            aria-label="Consulta do endpoint"
            value={query.id}
            onChange={(event) => setQueryId(event.target.value)}
          >
            {endpoint.queries.map((query) => (
              <option key={query.id} value={query.id}>
                {query.name}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy} type="submit">
          Buscar plano de execução
        </button>
      </form>
      {result ? (
        <div className="query-plan-result" role="region" aria-label="Resultado da consulta">
          <div className="query-plan-caption">
            <span>
              CONSULTADO ÀS <time>{timestamp(result.at)}</time>
            </span>
            <span>
              Trabalho da consulta <b>{result.workUnits} unidades / requisição</b>
            </span>
          </div>
          <h3>Consulta SQL</h3>
          <pre className="query-code" aria-label="Consulta SQL">
            <code>{result.sql}</code>
          </pre>
          <h3>Plano de execução estimado</h3>
          <pre className="query-code plan-output" aria-label="Plano de execução">
            <code>{result.text}</code>
          </pre>
          <p className="query-snapshot-note">
            Este registro mostra a consulta no instante da busca. Busque novamente após uma
            intervenção para inspecionar o plano atual. Um acerto no cache evita a consulta; uma
            falha de cache ainda usa este plano.
          </p>
        </div>
      ) : (
        <div className="query-plan-empty">
          <span aria-hidden="true">⌘</span>
          <h3>Investigue por dentro da requisição.</h3>
          <p>
            Selecione um endpoint e uma de suas consultas; depois, busque o plano.
            <br />
            Quais operações produzem linhas e quanto trabalho elas exigem?
          </p>
        </div>
      )}
      <details className="plan-reading-guide" open={difficulty === 'guided'}>
        <summary>Como ler um plano de execução</summary>
        <dl>
          <dt>Nós de leitura</dt>
          <dd>
            Uma leitura sequencial percorre as linhas da tabela. Uma leitura por índice usa um
            índice para localizar ou ordenar linhas. Ambas podem ser adequadas, dependendo da
            consulta e dos dados.
          </dd>
          <dt>Sort e Limit</dt>
          <dd>
            Leia a árvore da leitura mais interna para fora. Sort ordena a entrada; Limit interrompe
            a produção após obter linhas suficientes.
          </dd>
          <dt>Cost e rows</dt>
          <dd>
            Cost é uma estimativa do planejador em unidades relativas, não em milissegundos. Rows
            estima as linhas de saída de cada nó, não o número de linhas examinadas.
          </dd>
        </dl>
      </details>
      <div className="panel-footer">
        Planos educacionais estimados a partir da simulação. A busca não executa SQL nem consome
        tempo simulado.
      </div>
    </section>
  );
}
