import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'learning-chaos-analytics-'));
const server = createServer();
const port = await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    server.close(() => resolve(address.port));
  });
});
const child = spawn('node', ['dist/main.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ANALYTICS_DATABASE: join(directory, 'integration.sqlite') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
child.stderr.setEncoding('utf8').on('data', chunk => { serverOutput += chunk; });
const base = `http://127.0.0.1:${port}/api`;
const authHeader = `Basic ${Buffer.from(`admin:${process.env.ANALYTICS_ADMIN_PASSWORD}`).toString('base64')}`;

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API encerrou antes de iniciar (código ${child.exitCode}): ${serverOutput}`);
    try {
      const response = await fetch(`${base}/sessions`);
      if (response.ok || response.status === 401) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('API não iniciou dentro do tempo esperado.');
}

try {
  await waitForApi();
  const denied = await fetch(`${base}/dashboard`);
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('www-authenticate') ?? '', /^Basic realm=/);
  const dashboard = await fetch(`${base}/dashboard`, { headers: { authorization: authHeader } });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Partidas e atividade/);

  const created = await fetch(`${base}/sessions`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenarioId: 'mercado-01', scenarioVersion: '2.0.0', difficulty: 'guided', seed: 42, engineVersion: '2.0.0' }),
  });
  assert.equal(created.status, 201);
  const session = await created.json();
  assert.match(session.id, /^[0-9a-f-]{36}$/);

  const ingested = await fetch(`${base}/sessions/${session.id}/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [
      { name: 'game_started', elapsedSeconds: 0, properties: { scenario_id: 'mercado-01' } },
      { name: 'time_advanced', elapsedSeconds: 30, properties: { seconds: 30, source: 'step_button' } },
    ] }),
  });
  assert.equal(ingested.status, 201);
  assert.deepEqual(await ingested.json(), { accepted: 2 });

  const deniedEvents = await fetch(`${base}/sessions/${session.id}/events`);
  assert.equal(deniedEvents.status, 401);
  const eventResponse = await fetch(`${base}/sessions/${session.id}/events`, { headers: { authorization: authHeader } });
  assert.equal(eventResponse.status, 200);
  const events = await eventResponse.json();
  assert.equal(events.length, 2);
  assert.equal(events[1].properties.source, 'step_button');
  assert.equal(events[1].elapsedSeconds, 30);

  const finished = await fetch(`${base}/sessions/${session.id}/finish`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ durationMs: 12000, simulatedSeconds: 30, status: 'ended' }),
  });
  assert.equal(finished.status, 201);
  assert.equal((await finished.json()).ended, true);

  const deniedList = await fetch(`${base}/sessions?limit=10`);
  assert.equal(deniedList.status, 401);
  const listed = await fetch(`${base}/sessions?limit=10`, { headers: { authorization: authHeader } });
  assert.equal(listed.status, 200);
  const sessions = await listed.json();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].durationMs, 12000);
  assert.equal(sessions[0].simulatedSeconds, 30);
  assert.equal(sessions[0].status, 'ended');

  const invalid = await fetch(`${base}/sessions/${session.id}/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [{ name: 'Invalid Event Name', elapsedSeconds: -1 }] }),
  });
  assert.equal(invalid.status, 400);
  console.log('Integração analytics aprovada: painel, Basic Auth, sessões, eventos, SQLite e validação.');
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    await new Promise(resolve => {
      child.once('exit', resolve);
      child.kill('SIGTERM');
    });
  }
  await rm(directory, { recursive: true, force: true });
}
