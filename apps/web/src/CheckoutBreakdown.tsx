import { useState } from 'react';
import type { Observation } from '../../../packages/sim-engine/src';

export function CheckoutBreakdown({ segments }: { segments: Observation['checkoutBreakdown'] }) {
  const [dimension, setDimension] = useState('sku');
  const rows =
    dimension === 'sku'
      ? segments.map((segment) => ({ ...segment, name: segment.sku }))
      : [...new Set(segments.map((segment) => segment.category))].map((category) => {
          const group = segments.filter((segment) => segment.category === category);
          const share = group.reduce((sum, segment) => sum + segment.share, 0);
          return {
            name: category,
            category,
            share,
            latency: Math.max(...group.map((segment) => segment.latency)),
            errorRate:
              group.reduce((sum, segment) => sum + segment.share * segment.errorRate, 0) / share,
          };
        });
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Compras por dimensão</h2>
        <label className="dimension-picker">
          Agrupar por
          <select
            aria-label="Dimensão das compras"
            value={dimension}
            onChange={(event) => setDimension(event.target.value)}
          >
            <option value="sku">Produto (SKU)</option>
            <option value="category">Categoria</option>
          </select>
        </label>
      </div>
      <div className="table-scroll">
        <table aria-label="Compras por dimensão">
          <thead>
            <tr>
              <th>{dimension === 'sku' ? 'Produto' : 'Categoria'}</th>
              <th>Categoria</th>
              <th>Parcela das compras</th>
              <th>p95</th>
              <th>Erros</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td>
                  <code>{row.name}</code>
                </td>
                <td>{row.category}</td>
                <td>{(row.share * 100).toLocaleString('pt-BR')}%</td>
                <td>{row.latency.toLocaleString('pt-BR')} ms</td>
                <td className={row.errorRate > 1 ? 'text-warning' : 'text-green'}>
                  {row.errorRate.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-footer">
        Taxas relativas às compras de cada grupo. A taxa global inclui também as requisições dos
        outros endpoints.
      </div>
    </section>
  );
}
