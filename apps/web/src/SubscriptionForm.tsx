import { useState, type FormEvent } from 'react';
import './subscription.css';

const endpoint =
  (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
    .VITE_ANALYTICS_URL ?? 'http://127.0.0.1:3001/api';

export function SubscriptionForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get('email');
    setBusy(true);
    setError(false);
    try {
      const response = await fetch(`${endpoint}/subscribers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error('Subscription failed');
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="subscription panel" aria-labelledby="subscription-title">
      <span className="eyebrow accent">PRÓXIMOS INCIDENTES / NOVIDADES</span>
      <h2 id="subscription-title">Gostou de investigar esse incidente?</h2>
      <p>
        O Learning in Chaos ainda está em desenvolvimento. Novos incidentes e funcionalidades estão
        a caminho.
      </p>
      {sent ? (
        <p className="subscription-success" role="status">
          Sua inscrição foi registrada. Obrigado!
        </p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="subscription-email">Quer receber um aviso quando houver novidades?</label>
          <div className="subscription-fields">
            <input
              id="subscription-email"
              name="email"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              placeholder="Seu e-mail"
              aria-label="Seu e-mail"
            />
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Enviando…' : 'Quero receber novidades'}
            </button>
          </div>
          {error && (
            <p className="feedback-error" role="alert">
              Não foi possível cadastrar agora. Tente novamente.
            </p>
          )}
        </form>
      )}
    </section>
  );
}
