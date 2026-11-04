export type ActionId =
  | 'rollback'
  | 'optimize-query'
  | 'cache'
  | 'replica'
  | 'scale-api'
  | 'pool'
  | 'restart'
  | 'stop-import'
  | 'create-index'
  | 'scale-db'
  | 'lock-timeout'
  | 'idle-timeout'
  | 'terminate-session'
  | 'resume-operation';
export type Difficulty = 'guided' | 'free';
export type InstrumentId =
  'database-sessions' | 'checkout-dimensions' | 'query-plans' | 'detailed-logs';
export const instruments: {
  id: InstrumentId;
  name: string;
  description: string;
  seconds: number;
  databaseWork: number;
  latency: number;
  cost: number;
}[] = [
  {
    id: 'database-sessions',
    name: 'Sessões e esperas do banco',
    description: 'Coleta conexões ativas, transações ociosas, esperas e detalhes das sessões.',
    seconds: 60,
    databaseWork: 100,
    latency: 4,
    cost: 0.02,
  },
  {
    id: 'checkout-dimensions',
    name: 'Compras por produto e categoria',
    description: 'Instrumenta latência e erros do checkout por SKU e categoria.',
    seconds: 60,
    databaseWork: 50,
    latency: 6,
    cost: 0.03,
  },
  {
    id: 'query-plans',
    name: 'Planos de execução',
    description: 'Instrumenta as consultas para permitir a captura de planos por endpoint.',
    seconds: 60,
    databaseWork: 60,
    latency: 3,
    cost: 0.02,
  },
  {
    id: 'detailed-logs',
    name: 'Logs detalhados',
    description:
      'Passa a registrar dimensões, consultas e esperas. Não reconstrói registros anteriores.',
    seconds: 60,
    databaseWork: 80,
    latency: 8,
    cost: 0.04,
  },
];

export const targetedActions: ActionId[] = [
  'cache',
  'create-index',
  'scale-api',
  'restart',
  'stop-import',
  'resume-operation',
  'optimize-query',
];
export function requiresActionTarget(mode: Difficulty, id: ActionId, scenarioId: string) {
  return (
    (mode === 'free' && targetedActions.includes(id)) ||
    (scenarioId === 'mercado-03' && ['stop-import', 'create-index', 'optimize-query'].includes(id))
  );
}

export const cacheProfiles: Record<string, { hitRate: number; workReduction: number }> = {
  'GET /products': { hitRate: 0.75, workReduction: 0.75 },
  'GET /products/:id': { hitRate: 0.9, workReduction: 0.9 },
  'GET /orders': { hitRate: 0.35, workReduction: 0.35 },
  'POST /checkout': { hitRate: 0.1, workReduction: 0.1 },
};
export const interventions: {
  id: ActionId;
  name: string;
  category: string;
  seconds: number;
  cost: number;
  description: string;
  tradeoff: string;
  guided: boolean;
}[] = [
  {
    id: 'resume-operation',
    name: 'Retomar operação',
    category: 'Operações',
    seconds: 60,
    cost: 0,
    description: 'Escolha uma operação interrompida para retomar seu processamento.',
    tradeoff:
      'O processamento é retomado em 60s. A importação volta em lotes curtos, sem manter a transação anterior aberta; trabalho desfeito exige reprocessamento.',
    guided: false,
  },
  {
    id: 'rollback',
    name: 'Reverter versão',
    category: 'Operações',
    seconds: 180,
    cost: 0,
    description:
      'Implanta novamente a versão anterior da aplicação. Pode ajudar quando mudanças recentes coincidem com o início de um incidente.',
    tradeoff:
      'Reverte todas as mudanças da versão. Não corrige problemas sem relação com o deploy.',
    guided: true,
  },
  {
    id: 'optimize-query',
    name: 'Usar consulta indexada',
    category: 'Aplicação',
    seconds: 240,
    cost: 0,
    description:
      'Troca a consulta do catálogo por uma variante que usa um índice existente. Índices permitem localizar registros sem percorrer e ordenar toda a tabela.',
    tradeoff:
      'Exige validar o resultado da consulta. Não acrescenta capacidade para um pico real de tráfego.',
    guided: true,
  },
  {
    id: 'cache',
    name: 'Adicionar cache de catálogo',
    category: 'Arquitetura',
    seconds: 120,
    cost: 0.06,
    description:
      'Atende leituras repetidas do catálogo em memória, com TTL de 60 segundos. O modelo considera 75% de acertos após a ativação.',
    tradeoff:
      'Os dados podem ficar desatualizados por até 60 segundos. Falhas de cache ainda consultam o banco. Adiciona US$ 0,06/h.',
    guided: true,
  },
  {
    id: 'replica',
    name: 'Adicionar réplica de leitura',
    category: 'Arquitetura',
    seconds: 300,
    cost: 0.18,
    description:
      'Divide as leituras igualmente entre o banco primário e uma segunda instância PostgreSQL. As escritas continuam no primário.',
    tradeoff:
      'O atraso de replicação pode gerar dados desatualizados. Não corrige consultas ineficientes nem acelera escritas. Adiciona US$ 0,18/h.',
    guided: true,
  },
  {
    id: 'scale-api',
    name: 'Escalar API para 2 instâncias',
    category: 'Capacidade',
    seconds: 300,
    cost: 0.12,
    description:
      'Duplica a capacidade de processamento da aplicação atrás de um balanceador de carga.',
    tradeoff:
      'As instâncias compartilham a capacidade do banco. Mais processamento na API não elimina um gargalo no banco. Adiciona US$ 0,12/h.',
    guided: false,
  },
  {
    id: 'pool',
    name: 'Aumentar pool de conexões',
    category: 'Configuração',
    seconds: 120,
    cost: 0,
    description:
      'Aumenta o limite compartilhado de 40 para 80 conexões, permitindo mais consultas simultâneas.',
    tradeoff:
      'Concorrência não aumenta a capacidade de processamento do banco. Um banco saturado pode acumular uma fila maior.',
    guided: false,
  },
  {
    id: 'restart',
    name: 'Reiniciar aplicação',
    category: 'Operações',
    seconds: 60,
    cost: 0,
    description: 'Reinicia o processo da API para limpar estados transitórios da aplicação.',
    tradeoff:
      'A API fica indisponível durante a reinicialização. O código e a capacidade do banco não mudam.',
    guided: false,
  },
  {
    id: 'stop-import',
    name: 'Interromper importação de estoque',
    category: 'Operações',
    seconds: 120,
    cost: 0,
    description:
      'Interrompe o processo externo de importação e encerra sua sessão no banco, desfazendo a transação aberta. Verifique as sessões antes de decidir.',
    tradeoff:
      'O lote de estoque não confirmado será desfeito. Exige reprocessamento posterior em lotes menores e transações curtas.',
    guided: true,
  },
  {
    id: 'create-index',
    name: 'Criar índice do catálogo',
    category: 'Banco de dados',
    seconds: 300,
    cost: 0,
    description:
      'Cria um índice em products.created_at para atender à ordenação do catálogo sem alterar o resultado da consulta.',
    tradeoff:
      'A construção leva 5 minutos simulados. O índice ocupa armazenamento e acrescenta manutenção nas escritas; esses custos não são quantificados neste modelo.',
    guided: true,
  },
  {
    id: 'scale-db',
    name: 'Aumentar capacidade do banco',
    category: 'Capacidade',
    seconds: 300,
    cost: 0.24,
    description:
      'Duplica a capacidade de processamento do PostgreSQL primário. A réplica, quando existe, mantém sua capacidade atual.',
    tradeoff:
      'Adiciona US$ 0,24/h. Não altera consultas nem libera bloqueios de transações. O modelo considera a troca de capacidade sem indisponibilidade.',
    guided: true,
  },
  {
    id: 'lock-timeout',
    name: 'Limitar espera por bloqueios',
    category: 'Banco de dados',
    seconds: 60,
    cost: 0,
    description:
      'Configura a aplicação para desistir de esperas por bloqueios após 1 segundo, liberando mais cedo as conexões ocupadas.',
    tradeoff:
      'As requisições afetadas continuam falhando. Reduz a espera e a ocupação do pool, mas não encerra a transação que mantém o bloqueio.',
    guided: true,
  },
  {
    id: 'idle-timeout',
    name: 'Limitar transações ociosas',
    category: 'Banco de dados',
    seconds: 60,
    cost: 0,
    description:
      'Configura o banco para encerrar sessões que permaneçam ociosas com uma transação aberta por 180 segundos.',
    tradeoff:
      'Transações encerradas são desfeitas e precisam ser reprocessadas. Afeta também outros processos que dependam de transações ociosas longas.',
    guided: true,
  },
  {
    id: 'terminate-session',
    name: 'Encerrar sessão do banco',
    category: 'Banco de dados',
    seconds: 30,
    cost: 0,
    description:
      'Solicita o encerramento de uma sessão específica. Consulte os detalhes e selecione o PID na aplicação.',
    tradeoff:
      'Desfaz o trabalho não confirmado da sessão. Encerrar uma sessão de compra pode abortar uma compra e causar falhas adicionais durante 30 segundos de reconexão.',
    guided: true,
  },
];

export function availableActions(mode: Difficulty, scenarioId = 'mercado-01') {
  const actions = interventions.filter((action) => {
    if (mode === 'free') return action.id !== 'scale-db';
    return (
      action.guided &&
      (!['stop-import', 'terminate-session'].includes(action.id) ||
        ['mercado-02', 'mercado-03'].includes(scenarioId))
    );
  });
  if (mode === 'guided' && scenarioId !== 'mercado-03') return actions;
  const names: Partial<Record<ActionId, { name: string; description: string; tradeoff: string }>> =
    {
      cache: {
        name: 'Implementar cache',
        description:
          'Escolha o endpoint que receberá cache. Leituras usam chaves por produto ou cliente; no checkout, apenas leituras auxiliares são elegíveis.',
        tradeoff:
          'TTL de 60s; dados podem ficar desatualizados. Cada endpoint custa US$ 0,06/h. A taxa de acertos varia conforme o padrão de acesso. Escritas e bloqueios de estoque continuam no banco.',
      },
      'create-index': {
        name: 'Criar índice',
        description:
          'Escolha a consulta e a expressão do índice. Compare o plano e o SQL antes e depois da construção.',
        tradeoff:
          'Leva 5 minutos. Cada índice acrescenta 15 unidades/s de manutenção no banco e US$ 0,01/h de armazenamento, mesmo quando o plano não o utiliza.',
      },
      'scale-api': {
        name: 'Escalar componente',
        description: 'Escolha API, banco primário, réplica ou cache existente.',
        tradeoff:
          'Capacidade e cobrança dependem do componente: +US$ 0,12/h por API; +US$ 0,24/h no primário; +US$ 0,18/h na réplica; +US$ 0,06/h no cache. Máximo de 4 APIs e uma ampliação dos demais componentes.',
      },
      restart: {
        name: 'Reiniciar nó',
        description: 'Escolha um nó existente da topologia para reiniciar.',
        tradeoff:
          '60s de indisponibilidade no nó. API afeta sua parcela do tráfego; banco afeta todas as requisições e desfaz transações; réplica afeta suas leituras; cache usa o banco durante a recuperação. O worker de importação desfaz seu lote.',
      },
      'stop-import': {
        name: 'Parar operação',
        description: 'Selecione uma operação em execução e verifique suas dependências.',
        tradeoff:
          'Interromper uma operação desfaz seu trabalho pendente. Parar o checkout impede compras; parar recibos exige entrega posterior; a importação precisa ser reprocessada. Pode ser retomada depois.',
      },
      'optimize-query': {
        name: 'Reescrever consulta',
        description: 'Escolha a consulta que será reescrita para uma variante indexável.',
        tradeoff:
          'O resultado precisa ser validado. Só altera a consulta selecionada; não libera transações externas nem acrescenta capacidade.',
      },
    };
  return actions.map((action) => ({
    ...action,
    ...(mode === 'free' || ['stop-import', 'create-index', 'optimize-query'].includes(action.id)
      ? names[action.id]
      : {}),
    ...(scenarioId === 'mercado-03' && action.id === 'stop-import'
      ? {
          tradeoff:
            'Interromper o checkout impede compras. Parar recibos exige entrega posterior. Suspender uma rotina agendada cancela sua execução e as próximas tentativas; o fechamento pendente exige reprocessamento.',
        }
      : {}),
  }));
}
