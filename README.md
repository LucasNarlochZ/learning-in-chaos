# Learning in Chaos

> **Playable implementation:** two incidents, including a difficult investigation with misleading evidence, guided/free modes, deterministic simulation, and postmortems. See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, testing, and implementation limits. The product roadmap below describes later milestones as well.

**Aprenda engenharia de software enfrentando o caos de sistemas reais.**

*O código funciona. Até que não funciona mais. Você consegue descobrir por quê?*

## 1. Resumo

Learning in Chaos é um simulador educacional gratuito e open source, disponível diretamente no navegador, em que o jogador assume a operação de um sistema fictício e aprende arquitetura de software, backend, infraestrutura e sistemas distribuídos enfrentando incidentes de produção.

Diferentemente de simuladores tradicionais de system design, o jogador não recebe uma descrição explícita do problema nem instruções sobre quais tecnologias utilizar. Ele encontra um sistema em funcionamento que começa a apresentar comportamentos anormais: aumento de latência, erros, saturação de recursos e reclamações de clientes.

A partir dessas informações, precisa investigar métricas, logs, endpoints, componentes e eventos recentes para formular hipóteses, identificar possíveis causas e decidir como agir.

As decisões podem envolver alterações arquiteturais, ajustes de configuração, mitigação de incidentes ou reversão de mudanças. Cada intervenção produz consequências observáveis na simulação, podendo resolver o problema, gerar custos adicionais ou introduzir novos riscos.

O jogo oferece diferentes níveis de dificuldade, ajustando a quantidade de componentes e intervenções disponíveis. Cada opção possui explicações sobre seu funcionamento, vantagens, limitações e possíveis aplicações, permitindo que iniciantes aprendam gradualmente sem receber a solução pronta.

**Tese:** ensinar a pensar como engenheiro, desenvolvendo a capacidade de investigar sistemas, diagnosticar problemas e tomar decisões técnicas fundamentadas, em vez de simplesmente aplicar ferramentas.

**Contexto:** com o avanço da inteligência artificial na geração de código, compreender o comportamento dos sistemas, avaliar decisões arquiteturais e diagnosticar problemas continua sendo uma competência fundamental de engenharia.

**Objetivo do projeto:** construir um produto público, gratuito e open source, com usuários reais, que funcione como peça central de currículo e portfólio. Não existe meta de receita.

### Analytics de partidas

O projeto inclui uma API própria em NestJS com armazenamento SQLite para registrar sessões e eventos de jogo. A coleta permite analisar cenários e dificuldades iniciados, partidas retomadas e encerradas, duração real e simulada, abas abertas, hipóteses, consultas e inspeções, instrumentação, intervenções, além de pausas, velocidades e avanços manuais do relógio. Eventos não carregados durante uma indisponibilidade ficam em fila local para envio posterior.

Para iniciar a API, defina `ANALYTICS_ADMIN_PASSWORD` no ambiente e execute `npm run dev:analytics` em um terminal e `npm run dev` em outro. O painel fica em `http://127.0.0.1:3001/api/dashboard`; use o usuário `admin` e essa senha no prompt de autenticação do navegador. Para Docker Compose, crie `.env` na raiz com `ANALYTICS_ADMIN_PASSWORD=uma-senha-forte` (há um `.env.example` como modelo) e execute `docker compose up -d --build`. A API escuta em `http://127.0.0.1:3001/api`; defina `VITE_ANALYTICS_URL` para outro endereço e `ANALYTICS_CORS_ORIGIN` para os domínios permitidos em produção. O banco é criado em `apps/analytics/data/analytics.sqlite` (ou no caminho de `ANALYTICS_DATABASE`). A API oferece `POST /sessions`, `POST /sessions/:id/events`, `POST /sessions/:id/finish`, `GET /sessions` e consultas de sessão/eventos por ID. As rotas de leitura exigem Basic Auth; as rotas de ingestão permanecem acessíveis ao cliente do jogo.

---

## 2. O problema

Aprender engenharia de software vai muito além de conhecer linguagens, frameworks e ferramentas.

Grande parte dos conhecimentos relacionados a arquitetura, escalabilidade, confiabilidade e sistemas distribuídos é desenvolvida durante a experiência com sistemas reais, especialmente quando algo dá errado.

Entretanto, desenvolvedores iniciantes raramente têm oportunidades de enfrentar esses problemas em ambientes onde podem experimentar livremente.

Cursos tradicionais ensinam o que são caches, filas, balanceadores de carga e réplicas de banco de dados, mas nem sempre demonstram como identificar quando essas soluções são necessárias.

Saber o que é Redis não significa saber quando implementar cache.

Conhecer filas não significa compreender quando o processamento assíncrono melhora ou prejudica um sistema.

Da mesma forma, saber adicionar servidores não significa compreender se o gargalo realmente está na capacidade de processamento.

Muitos simuladores de arquitetura também apresentam previamente o problema que deve ser resolvido, direcionando o jogador para uma solução específica.

Isso desenvolve habilidades importantes de implementação e otimização, mas reduz a necessidade de investigar e diagnosticar.

Na produção, entretanto, problemas raramente aparecem acompanhados de suas causas.

O engenheiro recebe sintomas:

- A latência aumentou.
- Alguns endpoints começaram a apresentar erros.
- O banco está consumindo mais recursos.
- Clientes estão reclamando.
- Um serviço externo está demorando para responder.
- Um deploy foi realizado recentemente.

A partir disso, precisa descobrir o que está acontecendo.

**O Learning in Chaos busca preencher essa lacuna: oferecer um ambiente seguro para desenvolver raciocínio diagnóstico e tomada de decisão diante de problemas técnicos ambíguos.**

---

## 3. A proposta

O jogador assume a operação de um sistema fictício composto inicialmente por elementos simples, como uma API, um servidor de aplicação e um banco de dados.

Cada cenário apresenta um incidente de produção.

O jogador recebe informações sobre o contexto do sistema, mas não sobre a causa do incidente.

O sistema começa a apresentar sintomas, e o jogador precisa investigar.

Ele pode consultar métricas globais, analisar o comportamento de endpoints específicos, examinar logs, verificar eventos recentes e observar a utilização dos componentes.

Com base nas evidências, formula hipóteses e decide como intervir.

As intervenções podem incluir adicionar componentes, alterar configurações, executar rollback, limitar tráfego ou modificar aspectos específicos do comportamento da aplicação.

O sistema continua evoluindo durante a simulação, permitindo observar as consequências das decisões.

Ao final, o jogador recebe um postmortem educativo, com a linha do tempo do incidente, suas ações, impactos, diagnóstico e alternativas possíveis.

### Diferenciais

**1. Investigação antes da solução**

O jogador não recebe o diagnóstico pronto.

Ele precisa descobrir o problema a partir de evidências.

**2. Sintomas ambíguos**

Um aumento de latência pode ter múltiplas causas: carga elevada, regressão de desempenho, saturação de recursos ou dependências externas.

O objetivo é evitar cenários em que uma métrica isolada revele automaticamente a solução.

**3. Aprendizado progressivo**

O sistema de dificuldades reduz a quantidade de componentes e intervenções disponíveis para iniciantes, mantendo explicações acessíveis.

O jogador aprende gradualmente, sem precisar dominar todas as tecnologias antes de começar.

**4. Simulação dinâmica**

O sistema evolui durante a partida.

Intervenções não produzem apenas uma pontuação final: elas alteram o comportamento do sistema, permitindo observar seus efeitos.

**5. Múltiplas soluções válidas**

Diferentes estratégias podem resolver o mesmo incidente.

A avaliação considera disponibilidade, desempenho, custos, riscos e qualidade da investigação.

**6. Fatores humanos e externos**

Os incidentes não se limitam a picos de tráfego.

Deploys problemáticos, configurações incorretas, falhas de dependências e comportamentos adversariais também fazem parte da experiência.

**7. Consequências duradouras**

Em um futuro modo de progressão, decisões arquiteturais poderão afetar cenários posteriores.

**8. Acessibilidade**

O produto será gratuito, open source, acessível pelo navegador e disponível em português e inglês, sem exigir instalação ou cadastro para começar.

---

## 4. Público-alvo

### Primário

Desenvolvedores júnior e pleno que desejam desenvolver conhecimentos de arquitetura, backend, infraestrutura e sistemas distribuídos.

Especialmente aqueles que conhecem tecnologias individualmente, mas ainda possuem pouca experiência em diagnosticar problemas de produção.

### Secundário

- Estudantes de engenharia de software e ciência da computação.
- Desenvolvedores em transição para backend.
- Profissionais que desejam estudar system design.
- Pessoas se preparando para entrevistas técnicas.
- Desenvolvedores interessados em SRE e observabilidade.
- Pessoas que desenvolvem aplicações com auxílio de IA e desejam aprofundar sua compreensão técnica.

### Comunidades-alvo

Inicialmente:

- TabNews.
- LinkedIn.
- Comunidades brasileiras de desenvolvimento.
- GitHub.

Posteriormente:

- Reddit.
- dev.to.
- Hacker News.
- Comunidades internacionais de engenharia de software.

---

## 5. Como funciona uma partida

### 5.1. Briefing

O jogador recebe o contexto necessário para compreender o sistema que irá operar.

Por exemplo:

**Sistema:** plataforma fictícia de comércio eletrônico.

**Arquitetura inicial:**
- API REST.
- Servidor de aplicação.
- PostgreSQL.

**Objetivos operacionais:**
- Manter disponibilidade.
- Preservar latência aceitável.
- Controlar custos.
- Evitar alterações desnecessariamente arriscadas.

O briefing não informa qual incidente acontecerá ou como resolvê-lo.

### 5.2. Sintomas

O jogador encontra o sistema apresentando comportamentos anormais.

Exemplo:

**Produção — Estado: degradado**

| Métrica | Valor atual |
|---|---:|
| Requisições/s | 420 |
| Latência p95 | 2.400 ms |
| Erros 5xx | 8,3% |
| CPU da API | 64% |
| CPU do banco | 93% |

**Alertas recentes:**

- 14:32 — Latência acima do limite esperado.
- 14:34 — Taxa de erros aumentando.
- 14:36 — Pool de conexões próximo da capacidade.

**Mensagens de clientes:**

"Não consigo finalizar minha compra."

"A página de produtos está muito lenta."

Essas informações são suficientes para indicar que existe um incidente, mas não necessariamente sua causa.

### 5.3. Investigação

O jogador utiliza ferramentas de observabilidade para compreender o comportamento do sistema.

Inicialmente:

- Métricas globais.
- Métricas por endpoint.
- Logs da aplicação.
- Métricas do banco.
- Histórico de deploys.
- Arquitetura atual.

Posteriormente:

- Tracing distribuído.
- Consultas lentas.
- Métricas de cache.
- Filas.
- Dependências externas.
- Informações de rede.

Por exemplo, ao investigar o tráfego por endpoint:

| Endpoint | Requisições/min | Latência p95 |
|---|---:|---:|
| GET /products | 18.000 | 2.800 ms |
| GET /products/:id | 4.200 | 180 ms |
| POST /checkout | 900 | 3.100 ms |
| GET /orders | 2.000 | 220 ms |

O jogador pode investigar quais endpoints estão mais lentos, quais recebem mais tráfego e quais dependências utilizam.

A intenção é que ele construa seu diagnóstico progressivamente.

### 5.4. Formulação de hipóteses

O jogador formula hipóteses a partir das evidências e as testa pelas intervenções, sem precisar preencher um campo de texto.

Exemplos:

- Aumento inesperado de tráfego.
- Regressão introduzida por deploy.
- Saturação do banco.
- Problema em uma dependência externa.
- Configuração inadequada.

O sistema não informa imediatamente se a hipótese está correta.

O jogador precisa buscar evidências que a sustentem ou contradigam.

No postmortem, o sistema infere as possibilidades testadas pelas ações e apresenta os efeitos observados no p95 e na taxa de erro. Consultar sessões exige apenas instrumentação ativa e uma consulta explícita.

### 5.5. Intervenção

Depois de investigar, o jogador pode modificar o sistema.

As possibilidades incluem:

**Componentes arquiteturais:**
- Cache.
- Read Replica.
- CDN.
- Fila.
- WAF.
- Load Balancer.
- Outros componentes introduzidos progressivamente.

**Configurações:**
- Número de instâncias.
- Pool de conexões.
- TTL de cache.
- Timeouts.
- Limites de requisições.

**Ações operacionais:**
- Rollback.
- Reinicialização de serviços.
- Desativação de funcionalidades.
- Mitigações temporárias.
- Alterações estruturadas no comportamento da aplicação.

Cada ação possui efeitos, limitações, riscos e custos.

O jogador não precisa necessariamente adicionar componentes para resolver um incidente.

Em algumas situações, a melhor decisão pode ser reverter uma alteração ou corrigir uma configuração existente.

### 5.6. Consequências

As intervenções alteram o estado do sistema.

O jogador observa seus efeitos nas métricas e nos eventos.

Uma decisão pode:

- Reduzir a latência.
- Melhorar a disponibilidade.
- Aumentar custos.
- Criar novos gargalos.
- Introduzir inconsistências.
- Apenas mitigar temporariamente o problema.
- Piorar o incidente.

O objetivo é permitir experimentação e compreensão das relações de causa e efeito.

### 5.7. Postmortem

Ao finalizar o incidente, o jogador recebe um relatório contendo:

- Causa raiz.
- Linha do tempo.
- Hipóteses investigadas.
- Decisões realizadas.
- Impacto nos usuários.
- Tempo de recuperação.
- Custos.
- Riscos assumidos.
- Alternativas possíveis.
- Explicações técnicas.

O postmortem deve funcionar como parte central do aprendizado, e não apenas como uma pontuação.

O relatório poderá ser compartilhado por link.

---

## 6. Sistema de dificuldades

O Learning in Chaos deve permitir que pessoas com diferentes níveis de conhecimento enfrentem incidentes sem que a dificuldade menor revele a solução.

A principal estratégia será **reduzir a quantidade de componentes e intervenções arquiteturais disponíveis**.

Cada componente terá uma descrição acessível de:

- O que é.
- Como funciona.
- Em quais situações costuma ajudar.
- Quais problemas não resolve.
- Quais custos e riscos introduz.

O jogador poderá consultar essas explicações antes de tomar decisões.

### Iniciante

Apresenta um conjunto reduzido de opções.

Por exemplo:

- Cache.
- Read Replica.

O jogador precisa compreender essas tecnologias e avaliar qual delas faz sentido para o problema investigado.

A seleção não deve revelar automaticamente a solução.

Dependendo do incidente, ambas podem ser úteis, apenas uma pode ser adequada ou nenhuma delas pode resolver a causa raiz.

As intervenções operacionais necessárias para manter o cenário solucionável também devem permanecer acessíveis.

### Intermediário

Apresenta um catálogo maior.

Por exemplo:

- Cache.
- Read Replica.
- CDN.
- Fila.
- Load Balancer.

O jogador precisa considerar mais alternativas e avaliar seus trade-offs.

### Avançado

Disponibiliza todas as intervenções tecnicamente aplicáveis ao cenário.

Isso pode incluir:

- Cache.
- Read Replica.
- CDN.
- Fila.
- WAF.
- Load Balancer.
- Alternativas de persistência.
- Configurações avançadas.

O desafio aumenta porque existem mais possibilidades, incluindo intervenções que podem ser inadequadas ou introduzir consequências negativas.

### Regras do sistema de dificuldades

1. A dificuldade não revela a causa do incidente.
2. A dificuldade não destaca automaticamente a solução correta.
3. Todas as dificuldades precisam oferecer ao menos uma estratégia válida de resolução.
4. Um conjunto reduzido de opções não significa que uma delas necessariamente precisa ser utilizada.
5. O jogador pode aprender sobre os componentes antes de decidir.
6. Usuários experientes podem acessar dificuldades maiores desde o início.
7. A progressão pode introduzir novos componentes gradualmente.

### MVP

Inicialmente, serão implementados dois níveis:

**Guiado:** catálogo reduzido, com explicações detalhadas.

**Livre:** catálogo completo de intervenções suportadas pelo cenário, com explicações opcionais.

Um nível intermediário poderá ser introduzido posteriormente, com base nos testes com usuários.

---

## 7. Simulação e controle do tempo

A simulação deve transmitir a sensação de operar um sistema que continua funcionando durante o incidente.

Em vez de depender de um botão global de "Rodar simulação" após cada alteração, o Learning in Chaos utilizará um modelo de **simulação contínua com tempo controlável**.

O jogador poderá:

- Pausar.
- Continuar.
- Acompanhar o sistema em velocidade normal.
- Acelerar o tempo simulado.

A interface mostrará a evolução das métricas e dos eventos conforme o tempo avança.

### Intervenções durante a simulação

As intervenções poderão consumir tempo simulado.

Exemplos ilustrativos:

| Intervenção | Tempo simulado |
|---|---:|
| Reiniciar aplicação | 1 minuto |
| Alterar configuração | 2 minutos |
| Executar rollback | 3 minutos |
| Adicionar capacidade | 5 minutos |

Esses tempos serão definidos conforme as abstrações educacionais de cada cenário.

Durante uma intervenção, o incidente poderá continuar afetando usuários.

Isso introduz trade-offs entre investigar mais, agir rapidamente e assumir riscos.

### Investigação sem pressão excessiva

Consultar métricas e analisar logs existentes não deve necessariamente consumir tempo simulado.

O objetivo principal é desenvolver raciocínio, não velocidade de reação.

A possibilidade de pausar permitirá que iniciantes estudem conceitos e avaliem alternativas sem pressão constante.

Um futuro modo de desafio poderá introduzir restrições mais rígidas.

### Determinismo

O motor será baseado em tempo simulado, independentemente do tempo real do navegador.

Cada partida deverá poder ser reproduzida utilizando:

- Seed.
- Versão do motor.
- Versão do cenário.
- Decisões tomadas.
- Instantes simulados das decisões.

Isso permitirá compartilhar resultados, comparar estratégias e validar partidas no servidor.

---

## 8. Catálogo de incidentes

| Categoria | Exemplos | Aprendizado |
|---|---|---|
| Carga | Pico legítimo de tráfego, campanha de marketing | Escalabilidade, cache, filas e limites |
| Humanos | Deploy com query sem índice, retry sem backoff, migration problemática | Rollback, deploy gradual e blast radius |
| Adversariais | DDoS, scraping, credential stuffing | Rate limiting, WAF e identificação de tráfego |
| Dependências externas | Gateway de pagamento lento ou indisponível | Timeouts, circuit breaker e fallback |
| Dados | Replicação atrasada, backfill saturando o banco | Consistência, capacidade e recuperação |
| Custos | Autoscaling descontrolado, excesso de logs | FinOps, observabilidade e limites |

### Princípios dos incidentes

**Ambiguidade inicial**

Os sintomas não devem revelar automaticamente a causa.

**Evidências coerentes**

Métricas, logs e eventos precisam ser consistentes com o estado real da simulação.

**Múltiplas hipóteses plausíveis**

O jogador deve ter motivos para considerar diferentes explicações.

**Soluções justificáveis**

Diferentes intervenções podem produzir resultados aceitáveis.

**Justiça**

Todo incidente precisa ser solucionável com as informações e intervenções disponíveis na dificuldade selecionada.

**Validação automatizada**

Um harness headless executará estratégias de referência para verificar a viabilidade dos cenários.

---

## 9. Escopo do MVP

O desenvolvimento será dividido entre uma primeira experiência jogável e um lançamento público mais completo.

### MVP inicial — Primeiro incidente jogável

**Objetivo:** validar se a investigação de incidentes é interessante e educativa.

Inclui:

- Motor determinístico.
- Um cenário completo.
- Simulação com tempo controlável.
- Métricas globais.
- Métricas por endpoint.
- Logs investigáveis.
- Histórico de eventos.
- Arquitetura inicial.
- Intervenções estruturadas.
- Dois níveis de dificuldade.
- Explicações dos componentes.
- Postmortem educativo.
- Execução no navegador sem cadastro.

O primeiro incidente deve começar com sintomas e exigir investigação.

### MVP público

Expansão para três cenários:

**1. Deploy com query sem índice**

Ensina diagnóstico de regressões, análise de métricas, consultas e rollback.

**2. Pico de tráfego com banco saturado**

Ensina capacidade, escalabilidade, cache e réplicas de leitura.

**3. Pico ambíguo entre campanha e ataque**

Ensina análise de tráfego, identificação de padrões e estratégias de mitigação.

Também inclui:

- Editor de arquitetura enxuto.
- Português e inglês.
- Relatórios compartilháveis com preview.
- Progresso local.
- Analytics.
- Monitoramento de erros.
- Interface de investigação refinada.

### Fora do MVP

- Edição livre de pseudocódigo.
- Kubernetes como conteúdo educacional.
- Mensageria avançada.
- Multi-região.
- Consistência distribuída avançada.
- Editor público de cenários.
- Conteúdo gerado por LLM em tempo real.
- Ranking.
- Incidente diário.
- Progressão persistente entre cenários.
- Modelo de negócio.

---

## 10. Login e API

O jogo deve funcionar sem login.

O cadastro será opcional e utilizado para sincronizar progresso, manter histórico, participar de rankings e compartilhar resultados persistentes.

### Experiência sem cadastro

- O jogador acessa o navegador.
- Seleciona o cenário e a dificuldade.
- Inicia imediatamente.
- O progresso é armazenado localmente.
- Ao concluir, pode compartilhar o relatório.
- O cadastro é apresentado como opção, não como exigência.

### Funcionalidades futuras da API

- Autenticação OAuth com GitHub e Google.
- Persistência de partidas.
- Sincronização de progresso.
- Histórico de decisões.
- Relatórios públicos.
- Ranking por cenário.
- Incidente diário com seed global.
- Documentação OpenAPI.
- Rate limiting.
- Validação de entrada.
- Testes de integração.
- Exclusão de conta e tratamento de dados conforme a LGPD.

### Validação de partidas

O cliente não enviará uma pontuação considerada confiável.

O servidor receberá os dados necessários para reproduzir a partida e executará novamente o motor para validar o resultado.

Cada partida deverá registrar:

- Identificador do cenário.
- Versão do cenário.
- Versão do motor.
- Seed.
- Dificuldade.
- Decisões.
- Tempo simulado das decisões.

### Decisão tecnológica

A API poderá ser implementada em TypeScript ou Java.

**TypeScript** favorece o compartilhamento do motor entre navegador e servidor, simplificando a reexecução determinística.

**Java/Spring Boot** pode oferecer valor adicional para um portfólio direcionado a vagas tradicionais de backend, mas introduz maior complexidade na integração com o motor.

A decisão deverá considerar a coerência arquitetural e o objetivo profissional.

---

## 11. Arquitetura técnica

### Motor de simulação — sim-engine

Implementado em TypeScript puro, sem dependências de DOM ou operações de entrada e saída.

Características:

- Simulação de eventos discretos.
- Fila de eventos ordenada pelo tempo simulado.
- PRNG determinístico com seed.
- Modelos simplificados baseados em teoria das filas.
- Componentes com capacidade, filas e limites.
- Processamento de intervenções.
- Execução headless.
- Execução em Web Worker.
- Reutilização no servidor para validação.

O motor deve representar o comportamento do sistema, não apenas aplicar modificadores arbitrários sobre métricas.

### Estado real e observabilidade

O motor manterá o estado real do sistema.

A camada de observabilidade produzirá informações acessíveis ao jogador:

- Métricas.
- Logs.
- Alertas.
- Eventos.
- Traces, futuramente.

O jogador não terá acesso direto à causa raiz armazenada no cenário.

Ele precisará interpretá-la a partir das evidências.

**Princípio arquitetural:** o simulador conhece a causa do incidente; o jogador observa apenas suas manifestações.

### Cenários

Definidos em YAML ou JSON declarativo.

Cada cenário conterá:

- Topologia inicial.
- Perfil de carga.
- Incidentes.
- Gatilhos.
- Alterações no comportamento do sistema.
- Evidências observáveis.
- Intervenções permitidas.
- Configurações por dificuldade.
- Critérios de sucesso.
- Conteúdo educacional.
- Templates de logs e mensagens.
- Informações do postmortem.

Os schemas serão validados com Zod.

### Sistema educacional

Separado do motor de simulação.

Responsável por:

- Explicações dos componentes.
- Conceitos técnicos.
- Configuração das dificuldades.
- Organização das intervenções disponíveis.
- Apresentação de feedback.
- Conteúdo do postmortem.

Essa separação permite evoluir a experiência educacional sem alterar necessariamente o comportamento físico da simulação.

### Frontend

Stack prevista:

- React.
- Vite.
- React Flow.
- uPlot.
- Zustand.
- Tailwind CSS.
- Listas virtualizadas para logs.

A interface será organizada em torno da investigação.

Seções principais:

- Visão geral.
- Métricas.
- Endpoints.
- Logs.
- Eventos e deploys.
- Arquitetura.
- Intervenções.

O editor arquitetural será inicialmente limitado aos componentes suportados pelo motor.

### Código do usuário

O MVP não executará código arbitrário.

Alterações de comportamento serão representadas por escolhas estruturadas ou uma AST limitada.

Por exemplo, uma consulta poderá ter variantes previamente definidas, com efeitos conhecidos no modelo de simulação.

### Conteúdo

LLMs poderão auxiliar offline na elaboração de:

- Logs.
- Mensagens fictícias de clientes.
- Variações narrativas.
- Explicações.
- Postmortems.

Todo conteúdo deverá passar por revisão humana.

Durante a partida, os resultados continuarão determinísticos.

### Monorepo

- pnpm.
- Turborepo.

Estrutura inicial:

```text
learning-in-chaos/
├── apps/
│   ├── web/
│   └── api/
├── packages/
│   ├── sim-engine/
│   ├── scenario-schema/
│   ├── scenarios/
│   ├── educational-content/
│   └── shared/
└── tooling/
```

A API será introduzida após a validação do jogo no navegador.

---

## 12. Infraestrutura e operação

### Frontend

Hospedagem estática no Cloudflare Pages.

O jogo deve continuar funcionando sem depender da disponibilidade da API.

### Backend

Inicialmente:

- Servidor pessoal.
- Docker Compose.
- Cloudflare Tunnel.
- PostgreSQL.

O uso de Cloudflare Tunnel reduz a necessidade de exposição direta de portas, mas não substitui controles de segurança da aplicação e da infraestrutura.

### Evolução

Após o lançamento e a obtenção de usuários:

- Migração para k3s.
- GitOps com Argo CD ou Flux.
- Observabilidade.
- Dashboards operacionais.
- Alertas.
- Estratégias de rollback.

Kubernetes não fará parte do caminho crítico do lançamento.

### Operação

- CI/CD.
- Testes automatizados.
- Backups testados.
- Logs estruturados.
- Métricas.
- Monitoramento de erros.
- Plano de recuperação.
- Documentação operacional.

Um objetivo futuro é publicar um postmortem de um incidente real enfrentado pela própria plataforma.

---

## 13. Roadmap

| Fase | Período estimado | Entrega |
|---|---|---|
| 0 | Semanas 0–1 | Fundação, análise de concorrentes e definição do primeiro incidente |
| 1 | Semanas 1–3 | Motor determinístico e cenário headless |
| 2 | Semanas 3–5 | Primeiro incidente jogável, investigação e controle do tempo |
| 3 | Semanas 5–7 | Dificuldades, explicações, postmortem e testes com usuários |
| 4 | Semana 8 | Lançamento inicial |
| 5 | Semanas 9–12 | Mais dois cenários, melhorias de UX e internacionalização |
| 6 | Semanas 13–16 | API, autenticação e persistência |
| 7 | Semanas 17–20 | Ranking, incidente diário e novos cenários |
| 8 | Semana 21+ | Infraestrutura avançada e expansão orientada por dados |

O cronograma é uma estimativa, não um compromisso rígido.

A prioridade será lançar uma experiência pequena e bem executada em vez de atrasar o produto para implementar todas as funcionalidades previstas.

### Evolução futura: campanha e comportamento da aplicação

Após validar o modo de incidentes independentes, o jogo poderá evoluir para uma experiência que combine a evolução da arquitetura com a corretude funcional da aplicação. A prioridade será reutilizar o motor, as ferramentas de investigação e os componentes existentes, sem manter sistemas de simulação independentes.

#### Campanha com arquitetura persistente

Na campanha, o jogador acompanhará um sistema desde uma arquitetura inicial simples, com API, servidor de aplicação e banco de dados. Novas tecnologias não serão apresentadas como conteúdo a ser aplicado antecipadamente: tráfego, requisitos, falhas e limitações criarão problemas que o jogador deverá investigar antes de decidir se uma mudança é necessária.

As decisões permanecerão nos capítulos seguintes. Cache poderá reduzir a carga no banco e exigir estratégias de invalidação; réplicas de leitura poderão ampliar a capacidade e introduzir custo e defasagem; mais instâncias da aplicação poderão resolver a saturação temporariamente e aumentar a concorrência sobre o banco. Essas consequências representam trade-offs, não punições. Eventos comuns poderão afetar todas as campanhas, enquanto incidentes condicionais dependerão da arquitetura construída.

Cada etapa poderá definir objetivos de disponibilidade, latência, corretude e orçamento operacional recorrente. A campanha incentivará soluções suficientes e sustentáveis para o contexto, em vez da arquitetura mais complexa.

#### Comportamento funcional e suporte ao cliente

As intervenções poderão alcançar regras de negócio, persistência, tratamento de falhas e concorrência. Assim, o sistema poderá parecer saudável em CPU, latência e erros HTTP e ainda falhar para seus usuários: cobranças duplicadas, saldos divergentes, pedidos ausentes, compras acima do estoque, notificações repetidas ou alterações revertidas.

Uma central de suporte fictícia complementará dashboards, métricas e logs. Reclamações serão evidências potencialmente incompletas, ambíguas ou contraditórias, a serem correlacionadas com logs, eventos de domínio, histórico de operações, mudanças recentes e estado dos dados. O jogador deverá distinguir sintomas, hipóteses e causas. Uma cobrança duplicada, por exemplo, poderá decorrer de retry sem idempotência, processamento concorrente ou duplicação de eventos. Essa investigação apresentará a experiência do usuário como sinal da saúde funcional e distinguirá disponibilidade de corretude.

#### Intervenções estruturadas na lógica

Inicialmente, o jogador escolherá variantes de implementação ou ajustará aspectos delimitados de uma operação, sem executar código arbitrário. As opções poderão incluir chaves de idempotência, transações atômicas, restrições de unicidade, estratégias de locking, retries com backoff, processamento assíncrono, deduplicação, reconciliação e políticas de consistência e invalidação de cache.

Pseudocódigo ou trechos ilustrativos poderão explicar cada alternativa, suas garantias, custos e limitações. As escolhas deverão representar estratégias com trade-offs, sem reduzir a decisão a uma resposta simplesmente certa ou errada. Edição livre de código fica como possibilidade posterior, fora do escopo inicial devido aos desafios de execução, segurança e modelagem.

#### Estado de domínio e interação com a infraestrutura

Uma camada de comportamento da aplicação poderá modelar entidades, operações de negócio, eventos de domínio e invariantes, separada dos modelos de infraestrutura. Em um sistema de compras, por exemplo, poderá acompanhar saldos, pedidos, transações, estoque, identificadores de requisição e estados de operações parcialmente concluídas.

O motor avaliará propriedades como ausência de débitos duplicados, respeito aos limites de estoque e consistência entre operações relacionadas. Violações poderão produzir reclamações, divergências em relatórios e eventos de auditoria. A camada de domínio e os modelos de infraestrutura poderão interagir pelo relógio simulado e pela fila de eventos: escalar horizontalmente pode expor concorrência; processamento assíncrono pode exigir idempotência; réplicas podem servir dados desatualizados; cache pode exigir invalidação; serviços distribuídos podem precisar de recuperação e consistência. Por outro lado, mudanças na lógica também poderão afetar desempenho, recursos, disponibilidade e custos.

#### Etapas de evolução

1. **Incidente funcional isolado:** problema de corretude, reclamações de clientes, dados investigáveis e intervenções estruturadas.
2. **Modelo de domínio:** entidades, operações e invariantes suficientes para simular concorrência, duplicação e consistência.
3. **Campanha experimental:** sequência curta de capítulos com arquitetura persistente, orçamento e consequências das decisões anteriores.
4. **Campanha dinâmica:** incidentes condicionais, progressão arquitetural, evolução da aplicação e desafios influenciados pelas escolhas do jogador.

O objetivo educacional é ampliar o foco da investigação de incidentes operacionais para o ciclo completo de evolução de sistemas de software. O jogador aprenderá por que soluções se tornam necessárias, quais garantias oferecem e que responsabilidades introduzem, considerando desempenho, disponibilidade, corretude, custos e experiência do usuário — dimensões que nem sempre melhoram juntas.

---

## 14. Panorama de projetos semelhantes

O Learning in Chaos não entra em um mercado vazio.

Existem projetos que exploram simulação de arquitetura, otimização de infraestrutura e resposta a incidentes.

### systemInPain

Simulador de system design baseado em missões, com arquitetura, métricas e problemas de escalabilidade.

Conforme a experiência inicial de uso observada, os desafios apresentam uma descrição relativamente explícita do problema e orientações sobre possíveis soluções.

**Diferenciação do Learning in Chaos:**

O jogador não recebe previamente o diagnóstico nem a indicação de quais componentes utilizar.

Ele começa observando sintomas e precisa identificar o problema por meio da investigação.

A dificuldade é ajustada reduzindo o número de intervenções disponíveis, não revelando a resposta.

### Cloud Arch Simulator

Jogo de arquitetura e infraestrutura distribuído pelo Steam, com simulação de tráfego, falhas, eventos e otimização.

**Diferenciação do Learning in Chaos:**

- Acesso direto pelo navegador.
- Gratuito.
- Open source.
- Português e inglês.
- Menor atrito de entrada.
- Investigação como mecânica central.
- Ênfase em diagnóstico e decisões operacionais.

O cronograma de lançamento também pode representar uma oportunidade de posicionamento antecipado.

### tiny-stacks e System Design Simulator

Projetos que permitem construir arquiteturas e observar seu comportamento.

**Diferenciação:**

O Learning in Chaos parte de sistemas existentes com problemas desconhecidos, em vez de concentrar a experiência na construção inicial da arquitetura.

### YouBrokeProd

Simulador voltado à investigação de incidentes.

**Diferenciação proposta:**

Combinar investigação com intervenções arquiteturais e simulação de consequências.

### Wheel of Misfortune e Kubefuffle

Exercícios de resposta a incidentes voltados a equipes e processos operacionais.

**Diferenciação:**

Experiência individual, interativa e acessível pelo navegador, com simulação técnica do sistema.

### Posicionamento competitivo

**Simuladores tradicionais:** apresentam problemas para o jogador resolver.

**Learning in Chaos:** apresenta sintomas para o jogador investigar.

O principal diferencial não é possuir mais componentes ou cenários, mas desenvolver a capacidade de descobrir qual problema precisa ser resolvido.

---

## 15. Estratégia de divulgação

O projeto será divulgado inicialmente em comunidades brasileiras de desenvolvimento de software.

### Narrativa principal

Com o avanço da IA na geração de código, compreender sistemas e tomar decisões técnicas fundamentadas continua sendo essencial.

Essa discussão funciona como um contexto favorável à divulgação do projeto.

**Mensagem de divulgação:**

"A IA escreve código. Você entende o sistema?"

### Proposta de valor

"Aprenda a investigar incidentes de produção, analisar métricas e tomar decisões de engenharia sem receber a solução pronta."

### Diferenciais de comunicação

- Gratuito.
- Open source.
- Sem instalação.
- Sem cadastro obrigatório.
- Disponível em português.
- Cenários interativos.
- Aprendizado por investigação.

### Estratégia inicial

- Vídeos curtos demonstrando incidentes.
- Artigos sobre decisões de arquitetura.
- Publicações mostrando a evolução do motor.
- Conteúdo sobre modelagem de sistemas.
- Compartilhamento dos postmortems.
- Testes com desenvolvedores de diferentes níveis.

A divulgação começará antes da implementação completa da plataforma.

---

## 16. Métricas de sucesso

### Adoção

- Visitantes.
- Taxa de início.
- Taxa de conclusão.
- Cenários jogados por usuário.
- Compartilhamento de relatórios.

### Experiência

- Tempo até a primeira interação relevante.
- Pontos de abandono.
- Uso das explicações dos componentes.
- Distribuição das dificuldades selecionadas.
- Quantidade de tentativas por incidente.
- Intervenções mais utilizadas.

### Aprendizado

- Testes de conhecimento antes e depois.
- Capacidade de identificar causas em cenários semelhantes.
- Evolução das hipóteses.
- Qualidade das decisões.
- Compreensão dos trade-offs.

### Comunidade

- Estrelas no GitHub.
- Forks.
- Issues.
- Contribuições.
- Feedback de engenheiros experientes.

### Objetivo inicial

Obter usuários reais, validar a experiência educacional e reunir evidências de aprendizado.

O projeto não será avaliado apenas pela quantidade de visitantes, mas também pela capacidade de proporcionar experiências úteis e tecnicamente consistentes.

---

## 17. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Simulação tecnicamente incorreta | Modelos fundamentados, testes e revisão técnica |
| Escopo excessivo | Primeiro incidente como produto completo |
| Frustração de iniciantes | Dificuldades, catálogo reduzido e explicações |
| Soluções evidentes | Sintomas ambíguos e alternativas plausíveis |
| Ferramentas insuficientes | Validação dos cenários por dificuldade |
| Simulação lenta | Motor de eventos discretos em Web Worker |
| Inconsistência entre métricas e logs | Observabilidade derivada do estado do motor |
| Excesso de complexidade arquitetural | Componentes introduzidos progressivamente |
| Falta de interesse | Testes antecipados com usuários |
| Alto custo de criação de cenários | Conteúdo declarativo e geração offline assistida |
| Concorrência | Posicionamento em investigação e diagnóstico |
| Indisponibilidade da API | Jogo independente no navegador |
| Segurança e abuso | Validação, isolamento, limites e controles de acesso |
| Resultados não reproduzíveis | Seed, versionamento e registro temporal das decisões |

---

## 18. Princípios de design

**1. Diagnóstico antes da solução**

O jogador deve descobrir a causa do incidente por meio de evidências, não receber o diagnóstico previamente.

**2. Ensinar conceitos sem entregar respostas**

As explicações devem demonstrar como as tecnologias funcionam e quando podem ser úteis, sem afirmar qual delas resolve o incidente atual.

**3. Reduzir complexidade sem remover raciocínio**

Dificuldades menores apresentam menos intervenções, mas preservam a necessidade de investigar e decidir.

**4. Simulação fiel, mas simples**

Os modelos devem representar adequadamente os comportamentos ensinados, deixando claras suas limitações.

**5. Incidentes justos**

Todo cenário precisa ser solucionável com as informações e ações disponibilizadas.

**6. Múltiplas soluções válidas**

O jogo deve avaliar consequências e trade-offs, não exigir uma única arquitetura considerada correta.

**7. Consequências observáveis**

As decisões devem produzir alterações compreensíveis no sistema.

**8. Controle do ritmo de aprendizado**

O jogador deve poder pausar e estudar sem ser penalizado simplesmente por precisar de mais tempo para compreender um conceito.

**9. Aprendizado por experimentação**

Erros fazem parte da experiência e devem gerar feedback educativo.

**10. Atrito mínimo**

O jogador deve conseguir começar rapidamente, sem instalar programas ou criar uma conta.

**11. Progressão gradual**

Novos componentes e conceitos serão introduzidos conforme o repertório do jogador aumenta.

**12. Engenharia acima de ferramentas**

O objetivo não é ensinar a escolher tecnologias populares, mas desenvolver a capacidade de compreender sistemas e justificar decisões.

---

## 19. Como o projeto aparece no currículo

O Learning in Chaos poderá demonstrar competências de engenharia de software, backend, arquitetura, modelagem, observabilidade e operação.

Exemplos de realizações, a serem utilizados conforme forem efetivamente implementados:

- "Criei e publiquei o Learning in Chaos, simulador educacional open source de incidentes de produção, com X usuários e Y% de conclusão no primeiro cenário."

- "Implementei um motor determinístico de simulação de eventos discretos em TypeScript, com modelagem de filas, capacidade e comportamento de sistemas distribuídos."

- "Desenvolvi uma camada de observabilidade simulada, produzindo métricas, logs e eventos consistentes com o estado do sistema."

- "Projetei um sistema de aprendizado progressivo baseado em dificuldades, intervenções arquiteturais e avaliação de decisões técnicas."

- "Implementei validação automatizada de cenários e reexecução determinística de partidas."

- "Desenvolvi API com autenticação OAuth, persistência e validação de partidas no servidor."

- "Operei a plataforma com CI/CD, observabilidade, backups e infraestrutura documentada."

- "Conduzi testes com usuários e utilizei métricas de comportamento para orientar a evolução do produto."

O principal objetivo é demonstrar não apenas capacidade de implementação, mas também decisões de engenharia fundamentadas e desenvolvimento de um produto utilizado por pessoas reais.

---

## 20. Decisões em aberto

### Produto

- Definir exatamente quais componentes estarão disponíveis em cada dificuldade.
- Decidir se o usuário poderá desbloquear manualmente opções avançadas.
- Definir os critérios de conclusão de incidentes.
- Determinar como
