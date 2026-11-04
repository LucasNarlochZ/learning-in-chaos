import { useId, useState } from 'react';
import {
  availableActions,
  requiresActionTarget,
  cacheProfiles,
  type ActionId,
  type Difficulty,
} from '../../../packages/educational-content/src';
import type { Observation } from '../../../packages/sim-engine/src';
import { InstrumentationWait } from './InstrumentationWait';

interface Props {
  mode: Difficulty;
  scenarioId: string;
  view: Observation;
  selected: ActionId | null;
  disabled: boolean;
  onSelect: (id: ActionId | null) => void;
  onApply: (id: ActionId, target?: string) => void;
}

export function InterventionTools({
  mode,
  scenarioId,
  view,
  selected,
  disabled,
  onSelect,
  onApply,
}: Props) {
  const feedbackId = useId();
  const [category, setCategory] = useState('Todas');
  const [targets, setTargets] = useState<Record<string, string>>({});
  const actions = availableActions(mode, scenarioId);
  const categories = [...new Set(actions.map((action) => action.category))];
  const visible = categories.includes(category) ? category : 'Todas';

  return (
    <>
      <label className="intervention-filter">
        Categoria de intervenção
        <select value={visible} onChange={(event) => setCategory(event.target.value)}>
          <option value="Todas">Todas · {actions.length} opções</option>
          {categories.map((name) => (
            <option key={name} value={name}>
              {name} · {actions.filter((action) => action.category === name).length}
            </option>
          ))}
        </select>
      </label>
      <div className="intervention-groups">
        {categories
          .filter((name) => visible === 'Todas' || name === visible)
          .map((name) => {
            const group = actions.filter((action) => action.category === name);
            return (
              <section
                className="intervention-group"
                aria-label={`Intervenções de ${name}`}
                key={name}
              >
                <h3>
                  {name}
                  <span>{group.length}</span>
                </h3>
                <div className="action-list">
                  {group.map((item) => {
                    const targeted = requiresActionTarget(mode, item.id, scenarioId);
                    const options =
                      view.actionTargets[item.id as keyof typeof view.actionTargets] ?? [];
                    const target = targets[item.id] ?? '';
                    const valid = options.some((option) => option.id === target);
                    const applied = targeted
                      ? !['restart', 'scale-api', 'stop-import', 'resume-operation'].includes(
                          item.id,
                        ) && view.appliedTargets.includes(`${item.id}:${target}`)
                      : item.id !== 'terminate-session' && view.completed.includes(item.id);
                    return (
                      <div
                        className={`action-card ${selected === item.id ? 'selected' : ''}`}
                        key={item.id}
                      >
                        <button
                          className="action-select"
                          aria-expanded={selected === item.id}
                          onClick={() => onSelect(selected === item.id ? null : item.id)}
                        >
                          <span className="action-category">{item.category}</span>
                          <strong>
                            {item.name}
                            <span>{applied ? '✓' : '+'}</span>
                          </strong>
                          <span className="action-meta">
                            {item.seconds / 60} min <span>·</span>{' '}
                            {targeted && ['scale-api', 'create-index'].includes(item.id)
                              ? 'Custo conforme o alvo'
                              : item.cost
                                ? `+US$ ${item.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/h`
                                : 'Sem custo adicional'}
                          </span>
                        </button>
                        {(mode === 'guided' || selected === item.id) && (
                          <p className="action-summary">{item.description}</p>
                        )}
                        {selected === item.id && (
                          <div className="action-detail">
                            <span className="eyebrow">CUSTOS E RISCOS</span>
                            <p>{item.tradeoff}</p>
                            {targeted && (
                              <label className="intervention-target">
                                Alvo de {item.name}
                                <select
                                  value={valid ? target : ''}
                                  onChange={(event) =>
                                    setTargets((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">Selecione um alvo</option>
                                  {options.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                {!options.length && (
                                  <small>Nenhum alvo disponível na topologia atual.</small>
                                )}
                              </label>
                            )}
                            {item.id === 'cache' && targeted && valid && (
                              <p className="target-estimate">
                                Acertos estimados: {Math.round(cacheProfiles[target].hitRate * 100)}
                                %.{' '}
                                {target.startsWith('POST')
                                  ? 'Cache somente de leituras auxiliares; confirmação e estoque sempre consultam o banco.'
                                  : 'Chave por produto ou cliente; TTL de 60s.'}
                              </p>
                            )}
                            <button
                              className="primary wide"
                              aria-describedby={
                                view.instrumentation.pending
                                  ? `${feedbackId}-${item.id}`
                                  : undefined
                              }
                              disabled={
                                disabled ||
                                !!view.pending ||
                                !!view.instrumentation.pending ||
                                applied ||
                                (targeted && !valid)
                              }
                              onClick={() => onApply(item.id, targeted ? target : undefined)}
                            >
                              {item.id === 'terminate-session'
                                ? 'Selecionar sessão na aplicação →'
                                : applied
                                  ? 'Aplicada ✓'
                                  : 'Aplicar intervenção →'}
                            </button>
                            <InstrumentationWait id={`${feedbackId}-${item.id}`} view={view} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>
    </>
  );
}
