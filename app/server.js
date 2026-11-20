#!/usr/bin/env node
// Agent Ofisi — local web app. Only 127.0.0.1. No dependencies (Node built-ins only).
//   node app/server.js   →  http://127.0.0.1:8770
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const S = require(path.join(__dirname, '..', 'lib', 'store.js'));
const W = require(path.join(__dirname, '..', 'lib', 'lab.js'));

const HOST = '127.0.0.1';
const PORT = Number(process.env.OFIS_PORT || 8770);
const PUB = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
const STALE_MIN = 25; // "working" with no new step for this long → probably stopped

S.ensureDirs();

function state(cb) {
  const roster = S.roster();
  const agents = roster.map((a) => {
    const s = S.getState(a.id);
    const stale = s.status === 'working' && s.updated && (Date.now() - new Date(s.updated).getTime()) > STALE_MIN * 60e3;
    return { ...a, state: { status: s.status, task: s.task, taskId: s.taskId, since: s.since, updated: s.updated, note: s.note || null, lastTask: s.lastTask || null, lastResult: s.lastResult || null, step: (s.steps && s.steps[0]) || null, stale } };
  });
  const board = S.getBoard().tasks.slice(-300);
  const journal = S.getJournal(150);
  const shift = S.readJSON(S.P.shift, null);
  let reports = [];
  try { reports = fs.readdirSync(S.P.reports).filter((f) => f.endsWith('.md')).sort().reverse().slice(0, 30); } catch {}
  W.gpuStatus((gpu) => cb({ t: S.now(), agents, board, journal, shift, gpu, reports }));
}

function agentDetail(id) {
  const a = S.resolveAgent(id);
  if (!a) return null;
  const s = S.getState(a.id);
  return { ...a, state: s, history: S.getHistory(a.id, 60), open: S.pendingFor(a.id), journal: S.getJournal(400).filter((e) => e.from === a.id || e.to === a.id).slice(0, 60) };
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Reject requests that come from other web pages (CSRF / DNS rebinding protection for a localhost server).
function sameOrigin(req) {
  const host = req.headers.host || '';
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) return false;
  const origin = req.headers.origin;
  if (origin && origin !== `http://${HOST}:${PORT}` && origin !== `http://localhost:${PORT}`) return false;
  return true;
}

const clients = new Set();
let pushTimer = null;
function pushSoon() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (!clients.size) return;
    state((st) => { const msg = `event: state\ndata: ${JSON.stringify(st)}\n\n`; for (const c of clients) c.write(msg); });
  }, 250);
}
try { fs.watch(S.DATA, { recursive: true }, (ev, f) => { if (f && !String(f).includes('.lock') && !String(f).endsWith('.tmp') && !String(f).includes('hook-debug')) pushSoon(); }); } catch (e) { console.log('fs.watch işləmir, yalnız 5 saniyəlik yeniləmə:', e.message); }
setInterval(pushSoon, 5000);
// Lab feedback → board + judge data (every 60 s while the office is open)
function wcSync() { try { const r = W.syncFeedback(); if (r.newCount) console.log(S.localStamp(), `Lab rəyi: ${r.newCount} yeni, ${r.bad} 👎 → Nova`); } catch (e) { console.log('Lab sync xətası:', e.message); } }
wcSync();
setInterval(wcSync, 60000);

function readBody(req, max = 20000) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > max) { reject(new Error('çox böyük')); req.destroy(); } });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (!sameOrigin(req)) return send(res, 403, { error: 'icazə yoxdur' });
    const u = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === 'GET' && u.pathname === '/api/state') return state((st) => send(res, 200, st));
    if (req.method === 'GET' && u.pathname === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      clients.add(res);
      state((st) => res.write(`event: state\ndata: ${JSON.stringify(st)}\n\n`));
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clients.delete(res); clearInterval(ping); });
      return;
    }
    let m;
    if (req.method === 'GET' && (m = u.pathname.match(/^\/api\/agent\/([a-z0-9_-]+)$/i))) {
      const d = agentDetail(m[1]);
      return d ? send(res, 200, d) : send(res, 404, { error: 'tapılmadı' });
    }
    if (req.method === 'GET' && (m = u.pathname.match(/^\/api\/report\/([\w.-]+\.md)$/))) {
      const f = path.join(S.P.reports, m[1]);
      if (!f.startsWith(S.P.reports) || !fs.existsSync(f)) return send(res, 404, { error: 'tapılmadı' });
      return send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain; charset=utf-8');
    }
    if (req.method === 'POST' && u.pathname === '/api/task') {
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, { error: 'JSON lazımdır' });
      const body = JSON.parse(await readBody(req) || '{}');
      const text = String(body.text || '').trim();
      if (!text) return send(res, 400, { error: 'Tapşırıq boşdur' });
      if (text.length > 4000) return send(res, 400, { error: 'Tapşırıq çox uzundur (4000 simvola qədər)' });
      const a = S.resolveAgent(body.to);
      if (!a) return send(res, 400, { error: 'Belə işçi yoxdur' });
      const t = S.addTask({ to: a.id, from: 'istifadəçi', text, source: 'panel' });
      pushSoon();
      return send(res, 200, { ok: true, task: t });
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'yox' });
    // static
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    const f = path.normalize(path.join(PUB, p));
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'Tapılmadı', 'text/plain; charset=utf-8');
    return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream');
  } catch (e) {
    console.log('xəta:', e.message);
    send(res, 500, { error: 'server xətası' });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.log(`Ofis artıq açıqdır: http://${HOST}:${PORT}`); process.exit(0); }
  throw e;
});
server.listen(PORT, HOST, () => console.log(`Agent Ofisi açıqdır: http://${HOST}:${PORT}  (bağlamaq üçün bu pəncərəni bağla)`));
