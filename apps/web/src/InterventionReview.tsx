import type { InterventionMetrics, Report } from '../../../packages/sim-engine/src';

const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const number = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

function measurement(metrics: InterventionMetrics) {
  return `p95 ${number(Math.round(metrics.latency))} ms · Erros ${number(metrics.errors)}% · Fila ${number(metrics.queue)} unidades de trabalho.`;
}

export function InterventionReview({ report }: { report: Report }) {
  return (
    <>
      <section className="panel" aria-label="Estado final do serviço">
        <div className="panel-heading">
          <h2>Estado final do serviço</h2>
          <span>{clock(report.finalMetrics.at)}</span>
        </div>
        <p className="alternative">{measurement(report.finalMetrics)}</p>
        <p className="alternative">
          {report.resolved
            ? `Metas atendidas por ${report.finalMetrics.stableSeconds}s consecutivos: p95 abaixo de 800 ms e erros abaixo de 1%.`
            : 'Investigação encerrada sem completar a janela de recuperação de 60s.'}
        </p>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Inferência pelas ações</h2>
          <span>{report.inferences.length} intervenções</span>
        </div>
        <p className="alternative">
          As ações sugerem quais possibilidades foram testadas. Cada linha mostra uma amostra do
          serviço no horário indicado. O efeito imediato pode incluir fila acumulada; observe também
          o resultado posterior. Mudanças simultâneas podem influenciar esses números.
        </p>
        {report.inferences.length ? (
          report.inferences.map((inference, index) => (
            <article
              className="risk-row"
              aria-label={`Análise de ${inference.name} às ${clock(inference.at)}`}
              key={index}
            >
              <strong>
                <time>{clock(inference.at)}</time> · {inference.name}
              </strong>
              <p>Possibilidade testada: {inference.hypothesis}</p>
              <p>
                Antes de iniciar ({clock(inference.at)}): {measurement(inference.before)}
              </p>
              {inference.after ? (
                <>
                  <p>
                    Ao concluir ({clock(inference.completesAt)}): {measurement(inference.after)}
                  </p>
                  {inference.after.errors < 1 &&
                    inference.after.latency >= 800 &&
                    inference.after.queue > 0 && (
                      <p>
                        Os erros estão dentro da meta, mas a fila acumulada ainda mantém a latência
                        alta nesta amostra.
                      </p>
                    )}
                  {inference.followUp ? (
                    <p>
                      Após {inference.followUp.at - inference.completesAt}s de observação (
                      {clock(inference.followUp.at)}): {measurement(inference.followUp)}
                    </p>
                  ) : (
                    <p>Sem amostra posterior à conclusão para avaliar a evolução.</p>
                  )}
                  {inference.observationEndedByChange && (
                    <p>
                      A observação foi interrompida por outra alteração; resultados posteriores não
                      foram atribuídos a esta intervenção.
                    </p>
                  )}
                </>
              ) : (
                <p>Intervenção não concluída. Sem resultado para avaliar.</p>
              )}
            </article>
          ))
        ) : (
          <p className="empty-copy">
            Nenhuma intervenção aplicada para inferir uma possibilidade testada.
          </p>
        )}
      </section>
    </>
  );
}
