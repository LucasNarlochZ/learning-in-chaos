import { useState, type FormEvent } from 'react';
import './feedback.css';

const endpoint = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_ANALYTICS_URL ?? 'http://127.0.0.1:3001/api';

export function FeedbackForm() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const rating = form.get('rating');
    try {
      const response = await fetch(`${endpoint}/feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category: form.get('category'),
          message: form.get('message'),
          name: form.get('name'),
          email: form.get('email'),
          rating: rating ? Number(rating) : null,
        }),
      });
      if (!response.ok) throw new Error('Não foi possível enviar agora. Tente novamente.');
      formElement.reset();
      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar agora. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="feedback-launcher" onClick={() => { setOpen(true); setSent(false); }}>
      <span aria-hidden="true">↗</span> Enviar feedback
    </button>
    {open && <div className="feedback-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <button type="button" className="feedback-close" aria-label="Fechar" onClick={() => setOpen(false)}>×</button>
        {sent ? <div className="feedback-success" role="status"><span>✓</span><div className="eyebrow">REGISTRO RECEBIDO</div><h2>Obrigado por ajudar a melhorar.</h2><p>Seu feedback foi salvo. Ele será lido pela equipe do projeto.</p><button className="primary" onClick={() => setOpen(false)}>Fechar</button></div> : <>
          <div className="eyebrow">UM SISTEMA MELHOR COMEÇA COM UMA OBSERVAÇÃO</div>
          <h2 id="feedback-title">O que você encontrou?</h2>
          <p className="feedback-intro">Conte sobre a experiência, uma ideia ou algo que não funcionou.</p>
          <form onSubmit={submit}>
            <label>Assunto
              <select name="category" required defaultValue="ux">
                <option value="ux">Problema de experiência ou usabilidade</option>
                <option value="feature">Sugestão de funcionalidade</option>
                <option value="bug">Erro ou comportamento inesperado</option>
              </select>
            </label>
            <label>Seu feedback <span className="feedback-required">OBRIGATÓRIO</span>
              <textarea name="message" required maxLength={5000} rows={5} placeholder="O que aconteceu? O que você esperava?" />
            </label>
            <div className="feedback-fields">
              <label>Nome <span>OPCIONAL</span><input name="name" maxLength={120} autoComplete="name" placeholder="Como podemos chamar você?" /></label>
              <label>E-mail <span>OPCIONAL</span><input name="email" type="email" maxLength={254} autoComplete="email" placeholder="Para responder, se necessário" /></label>
            </div>
            <label>Nota <span>OPCIONAL</span>
              <select name="rating" defaultValue=""><option value="">Prefiro não avaliar</option><option value="5">5 · Excelente</option><option value="4">4 · Muito bom</option><option value="3">3 · Regular</option><option value="2">2 · Ruim</option><option value="1">1 · Muito ruim</option></select>
            </label>
            {error && <p className="feedback-error" role="alert">{error}</p>}
            <div className="feedback-actions"><span>O nome e o e-mail são opcionais.</span><button className="primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar feedback ↗'}</button></div>
          </form>
        </>}
      </section>
    </div>}
  </>;
}
