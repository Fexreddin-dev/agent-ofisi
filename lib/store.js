// Agent Ofisi — shared store (state files, inbox, board, journal). No dependencies.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const P = {
  agents: path.join(DATA, 'agents'),
  inbox: path.join(DATA, 'inbox'),
  history: path.join(DATA, 'history'),
  reports: path.join(DATA, 'reports'),
  board: path.join(DATA, 'board.json'),
  journal: path.join(DATA, 'journal.jsonl'),
  shift: path.join(DATA, 'shift.json'),
  runs: path.join(DATA, 'runs.json'),
  gpuLock: path.join(DATA, 'gpu.lock'),
  lock: path.join(DATA, '.lock'),
  roster: path.join(ROOT, 'roster.json'),
};

function ensureDirs() {
  for (const d of [DATA, P.agents, P.inbox, P.history, P.reports, path.join(ROOT, 'out')]) fs.mkdirSync(d, { recursive: true });
}

function now() { return new Date().toISOString(); }
function localStamp(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

function readJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch { return def; }
}
function writeJSON(file, obj) {
  const tmp = file + '.' + process.pid + '.' + Math.random().toString(36).slice(2) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), 'utf8');
  for (let i = 0; i < 20; i++) {
    try { fs.renameSync(tmp, file); return; } catch (e) { sleep(25); }
  }
  try { fs.writeFileSync(file, JSON.stringify(obj, null, 1), 'utf8'); } finally { try { fs.unlinkSync(tmp); } catch {} }
}
function appendJSONL(file, obj) { fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8'); }
function readJSONL(file, limit) {
  let txt = '';
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const lines = txt.split('\n').filter(Boolean);
  const pick = limit ? lines.slice(-limit) : lines;
  const out = [];
  for (const l of pick) { try { out.push(JSON.parse(l)); } catch {} }
  return out;
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// Small cross-process lock (mkdir is atomic on Windows too). Stale after 5 s.
function withLock(fn) {
  ensureDirs();
  let got = false;
  for (let i = 0; i < 100; i++) {
    try { fs.mkdirSync(P.lock); got = true; break; } catch {
      try { if (Date.now() - fs.statSync(P.lock).mtimeMs > 5000) fs.rmdirSync(P.lock); } catch {}
      sleep(20);
    }
  }
  try { return fn(); } finally { if (got) try { fs.rmdirSync(P.lock); } catch {} }
}

// ---------- roster ----------
function norm(s) {
  return String(s || '').toLowerCase()
    .replace(/[əä]/g, 'e').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ı/g, 'i').replace(/i̇/g, 'i')
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/[^a-z0-9]/g, '');
}
function roster() { return readJSON(P.roster, { agents: [] }).agents; }
function resolveAgent(name) {
  const n = norm(name);
  if (!n) return null;
  return roster().find((a) => norm(a.id) === n || norm(a.ad) === n || (a.aka || []).some((x) => norm(x) === n)) || null;
}

// ---------- agent state ----------
const STATUS = { idle: 'boşdur', working: 'işləyir', waiting: 'məni gözləyir', blocked: 'bloklanıb' };
function stateFile(id) { return path.join(P.agents, id + '.json'); }
function getState(id) {
  return readJSON(stateFile(id), { id, status: 'idle', task: null, taskId: null, since: null, steps: [], files: [], updated: null });
}
function setState(id, patch) {
  return withLock(() => {
    const s = getState(id);
    const changed = patch.status && patch.status !== s.status;
    Object.assign(s, patch, { updated: now() });
    if (changed) s.since = now();
    writeJSON(stateFile(id), s);
    return s;
  });
}
function addStep(id, text, file) {
  return withLock(() => {
    const s = getState(id);
    s.steps = [{ t: now(), text: String(text).slice(0, 240) }, ...(s.steps || [])].slice(0, 40);
    if (file) {
      const f = String(file);
      s.files = [f, ...(s.files || []).filter((x) => x !== f)].slice(0, 60);
      s.taskFiles = [f, ...(s.taskFiles || []).filter((x) => x !== f)].slice(0, 60);
    }
    if (s.status !== 'working') { s.status = 'working'; s.since = now(); }
    s.updated = now();
    writeJSON(stateFile(id), s);
    return s;
  });
}
function addHistory(id, entry) { appendJSONL(path.join(P.history, id + '.jsonl'), { t: now(), ...entry }); }
function getHistory(id, limit = 100) { return readJSONL(path.join(P.history, id + '.jsonl'), limit).reverse(); }

// ---------- board / inbox / journal ----------
function getBoard() { return readJSON(P.board, { next: 1, tasks: [] }); }
function addTask({ to, from = 'istifadəçi', text, source = 'chat', parent = null }) {
  const a = resolveAgent(to);
  if (!a) throw new Error('Belə işçi yoxdur: ' + to);
  const t = withLock(() => {
    const b = getBoard();
    const task = { id: 'T-' + b.next++, to: a.id, from, text: String(text).slice(0, 4000), source, parent, status: 'pending', created: now(), updated: now(), result: null };
    b.tasks.push(task);
    if (b.tasks.length > 1000) b.tasks = b.tasks.slice(-1000);
    writeJSON(P.board, b);
    return task;
  });
  appendJSONL(path.join(P.inbox, a.id + '.jsonl'), { t: now(), id: t.id, from, text: t.text, source });
  journal({ type: source === 'handoff' ? 'handoff' : 'task', from, to: a.id, task: t.id, text: t.text.slice(0, 200), source });
  return t;
}
function updateTask(id, patch) {
  return withLock(() => {
    const b = getBoard();
    const t = b.tasks.find((x) => x.id === id);
    if (!t) return null;
    Object.assign(t, patch, { updated: now() });
    writeJSON(P.board, b);
    return t;
  });
}
function pendingFor(id) { return getBoard().tasks.filter((t) => t.to === id && (t.status === 'pending' || t.status === 'active')); }
function journal(entry) { ensureDirs(); appendJSONL(P.journal, { t: now(), ...entry }); }
function getJournal(limit = 200) { return readJSONL(P.journal, limit).reverse(); }

// ---------- worker reply parsing ----------
function parseReply(text) {
  const s = String(text || '');
  const grab = (re) => { const m = s.match(re); return m ? m[1].trim() : null; };
  const out = {
    result: grab(/^\s*\**N[ƏE]T[İI]C[ƏE]\**\s*:\s*(.+)$/im),
    files: grab(/^\s*\**FAYLLAR\**\s*:\s*(.+)$/im),
    next: null, nextText: null, status: 'idle',
  };
  const nx = grab(/^\s*\**N[ÖO]VB[ƏE]T[İI]\**\s*:\s*(.+)$/im);
  if (nx && !/^yoxdur\b/i.test(nx)) {
    const m = nx.match(/^([^—–:\-]+?)\s*[—–:\-]+\s*(.+)$/);
    const who = resolveAgent(m ? m[1] : nx.split(/\s+/)[0]);
    if (who) { out.next = who.id; out.nextText = m ? m[2] : nx; }
  }
  const st = grab(/^\s*\**STATUS\**\s*:\s*(.+)$/im);
  if (st) {
    const n = norm(st);
    if (n.includes('gozle')) out.status = 'waiting';
    else if (n.includes('blok')) out.status = 'blocked';
  }
  return out;
}

// Mask anything that looks like a secret before it is stored.
function mask(s) {
  return String(s || '')
    .replace(/((?:api[_-]?key|token|secret|password|passwd|key)\s*[=:]\s*)\S+/gi, '$1***')
    .replace(/\b(sk|pk|ghp|hf|gho|xox[bap])[-_][A-Za-z0-9_\-]{12,}\b/g, '***')
    .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, (m) => (/[0-9]/.test(m) && /[a-zA-Z]/.test(m) ? '***' : m));
}

module.exports = {
  ROOT, DATA, P, STATUS, ensureDirs, now, localStamp, readJSON, writeJSON, appendJSONL, readJSONL, withLock,
  norm, roster, resolveAgent, getState, setState, addStep, addHistory, getHistory,
  getBoard, addTask, updateTask, pendingFor, journal, getJournal, parseReply, mask,
};
