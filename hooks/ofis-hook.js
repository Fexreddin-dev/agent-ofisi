#!/usr/bin/env node
// Agent Ofisi — Claude Code hook. Writes agent state automatically (agents don't have to remember).
// Registered in ~/.claude/settings.json for: PreToolUse, PostToolUse, SubagentStart, SubagentStop,
// UserPromptSubmit, Notification, Stop. Never blocks Claude: always exits 0, prints nothing.
'use strict';
const fs = require('fs');
const path = require('path');
let S;
try { S = require(path.join(__dirname, '..', 'lib', 'store.js')); } catch { process.exit(0); }

const AGENT_TOOLS = new Set(['Agent', 'Task']);
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

function inOfis(cwd) {
  if (!cwd) return false;
  const a = path.resolve(cwd).toLowerCase();
  const b = S.ROOT.toLowerCase();
  return a === b || a.startsWith(b + path.sep);
}

function base(p) { return p ? path.basename(String(p)) : ''; }

function describe(tool, inp = {}) {
  switch (tool) {
    case 'Edit': case 'MultiEdit': case 'NotebookEdit': return 'Faylı dəyişdi: ' + base(inp.file_path || inp.notebook_path);
    case 'Write': return 'Fayl yazdı: ' + base(inp.file_path);
    case 'Read': return 'Oxudu: ' + base(inp.file_path);
    case 'Bash': case 'PowerShell': return 'Əmr: ' + S.mask(inp.description || inp.command || '').slice(0, 140);
    case 'Grep': return 'Axtardı: ' + String(inp.pattern || '').slice(0, 80);
    case 'Glob': return 'Fayl axtardı: ' + String(inp.pattern || '').slice(0, 80);
    case 'WebSearch': return 'Vebdə axtardı: ' + String(inp.query || '').slice(0, 100);
    case 'WebFetch': { let h = ''; try { h = new URL(inp.url).host; } catch {} return 'Səhifə oxudu: ' + h; }
    case 'Skill': return 'Skill işə saldı: ' + (inp.skill || '');
    case 'Agent': case 'Task': return 'İşçi çağırdı: ' + (inp.subagent_type || '') + ' — ' + String(inp.description || '').slice(0, 80);
    default: return /^mcp__/.test(tool) ? 'Alət: ' + tool.split('__').pop() : tool;
  }
}

function textOf(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(textOf).filter(Boolean).join('\n');
  if (typeof x === 'object') {
    if (typeof x.text === 'string') return x.text;
    if (x.content) return textOf(x.content);
    if (x.result) return textOf(x.result);
    if (x.message) return textOf(x.message);
  }
  return '';
}

function lastAssistantText(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      let o; try { o = JSON.parse(lines[i]); } catch { continue; }
      if (o.type === 'assistant' || (o.message && o.message.role === 'assistant')) {
        const t = textOf(o.message && o.message.content);
        if (t && t.trim()) return t;
      }
    }
  } catch {}
  return '';
}

// runs.json: pending prompts per agent type, active runs by agent_id, finished keys (dedupe)
function runs() { return S.readJSON(S.P.runs, { pending: {}, active: {}, done: [] }); }
function saveRuns(r) { r.done = (r.done || []).slice(-300); S.writeJSON(S.P.runs, r); }

function startCall(a, inp, cwd) {
  const ti = inp.tool_input || {};
  const prompt = String(ti.prompt || '');
  const m = prompt.match(/\[(T-\d+)\]/);
  const taskId = m ? m[1] : null;
  const desc = String(ti.description || prompt.split('\n')[0] || '').slice(0, 200);
  S.withLock(() => { const r = runs(); r.pending[a.id] = { desc, taskId, t: S.now() }; saveRuns(r); });
  S.setState(a.id, { status: 'working', task: desc, taskId, prompt: S.mask(prompt.slice(0, 2000)), taskFiles: [], started: S.now(), project: cwd || null });
  S.addStep(a.id, 'Tapşırıq aldı: ' + desc);
  if (taskId) S.updateTask(taskId, { status: 'active' });
  S.journal({ type: 'call', from: inOfis(cwd) ? 'atlas' : 'çat', to: a.id, task: taskId, text: desc, project: cwd ? path.basename(cwd) : null });
}

function finish(id, text, key) {
  if (!text || !text.trim()) return;
  const k = key || ('h' + require('crypto').createHash('md5').update(id + text).digest('hex'));
  let dup = false;
  S.withLock(() => {
    const r = runs();
    if (r.done.includes(k)) { dup = true; return; }
    r.done.push(k);
    delete r.pending[id];
    saveRuns(r);
  });
  if (dup) return;
  const p = S.parseReply(text);
  const st = S.getState(id);
  const result = S.mask(p.result || text.trim().split('\n').slice(-6).join(' ')).slice(0, 600);
  S.setState(id, { status: p.status, lastTask: st.task, lastResult: result, task: p.status === 'idle' ? null : st.task, ended: S.now() });
  S.addHistory(id, { task: st.task, taskId: st.taskId, result, status: p.status, files: st.taskFiles || [], next: p.next, project: st.project });
  if (st.taskId) S.updateTask(st.taskId, { status: p.status === 'idle' ? 'done' : p.status, result });
  S.journal({ type: 'done', from: id, task: st.taskId, status: p.status, text: result.slice(0, 200) });
  if (p.next) {
    try { S.addTask({ to: p.next, from: id, text: p.nextText, source: 'handoff', parent: st.taskId }); } catch {}
  }
}

function main() {
  const raw = readStdin();
  let inp; try { inp = JSON.parse(raw); } catch { return; }
  S.ensureDirs();
  if (fs.existsSync(path.join(S.DATA, 'DEBUG'))) {
    const keys = Object.keys(inp).join(',');
    try { fs.appendFileSync(path.join(S.DATA, 'hook-debug.log'), `${S.now()} ${inp.hook_event_name} tool=${inp.tool_name || ''} agent_type=${inp.agent_type || ''} keys=${keys}\n`); } catch {}
  }
  const ev = inp.hook_event_name;
  const cwd = inp.cwd;
  const sub = inp.agent_type ? S.resolveAgent(inp.agent_type) : null;
  const ofis = inOfis(cwd);

  if (ev === 'PreToolUse') {
    if (!inp.agent_type && AGENT_TOOLS.has(inp.tool_name)) {
      const a = S.resolveAgent((inp.tool_input || {}).subagent_type);
      if (a && a.subagent) startCall(a, inp, cwd);
    }
    return;
  }
  if (ev === 'PostToolUse') {
    const ti = inp.tool_input || {};
    if (sub && sub.subagent) {
      if (inp.tool_name === 'SubagentHandback') { finish(sub.id, textOf(ti), inp.agent_id ? 'agent:' + inp.agent_id : null); return; }
      S.addStep(sub.id, describe(inp.tool_name, ti), FILE_TOOLS.has(inp.tool_name) ? (ti.file_path || ti.notebook_path) : null);
      return;
    }
    if (!inp.agent_type && AGENT_TOOLS.has(inp.tool_name)) {
      // Fallback only: normally SubagentStop / SubagentHandback already finished this run.
      const a = S.resolveAgent(ti.subagent_type);
      const t = textOf(inp.tool_response);
      if (a && a.subagent && runs().pending[a.id] && /N[ƏE]T[İI]C[ƏE]\s*:|STATUS\s*:|N[ÖO]VB[ƏE]T[İI]\s*:/i.test(t)) finish(a.id, t, inp.tool_use_id || null);
    }
    if (ofis && !inp.agent_type && inp.tool_name !== 'Read') {
      S.addStep('atlas', describe(inp.tool_name, ti), FILE_TOOLS.has(inp.tool_name) ? ti.file_path : null);
    }
    return;
  }
  if (ev === 'PostToolUseFailure') {
    const ti = inp.tool_input || {};
    if (!inp.agent_type && AGENT_TOOLS.has(inp.tool_name)) {
      const a = S.resolveAgent(ti.subagent_type);
      if (a && a.subagent) {
        const st = S.getState(a.id);
        S.setState(a.id, { status: 'idle', task: null, note: 'Başlaya bilmədi: ' + String(inp.error || '').slice(0, 160) });
        if (st.taskId) S.updateTask(st.taskId, { status: 'pending' });
        S.withLock(() => { const r = runs(); delete r.pending[a.id]; saveRuns(r); });
      }
    } else if (inp.agent_type && sub && sub.subagent) {
      S.addStep(sub.id, 'Alınmadı: ' + describe(inp.tool_name, ti));
    }
    return;
  }
  if (ev === 'SubagentStart') {
    if (sub && sub.subagent) {
      S.withLock(() => { const r = runs(); r.active[inp.agent_id || sub.id] = { type: sub.id, t: S.now() }; saveRuns(r); });
      if (S.getState(sub.id).status !== 'working') S.setState(sub.id, { status: 'working', started: S.now() });
    }
    return;
  }
  if (ev === 'SubagentStop') {
    if (sub && sub.subagent) {
      let t = inp.last_assistant_message || '';
      if (!t && inp.agent_transcript_path) t = lastAssistantText(inp.agent_transcript_path);
      if (t) finish(sub.id, textOf(t), inp.agent_id ? 'agent:' + inp.agent_id : null);
      else if (S.getState(sub.id).status === 'working') S.setState(sub.id, { status: 'idle', task: null });
      S.withLock(() => { const r = runs(); delete r.active[inp.agent_id || sub.id]; saveRuns(r); });
    }
    return;
  }
  if (!ofis) return;
  if (ev === 'UserPromptSubmit') {
    S.setState('atlas', { status: 'working', task: S.mask(String(inp.prompt || '')).slice(0, 200) });
  } else if (ev === 'Notification') {
    S.setState('atlas', { status: 'waiting', note: String(inp.message || '').slice(0, 200) });
  } else if (ev === 'Stop') {
    S.setState('atlas', { status: 'idle' });
  }
}

try { main(); } catch (e) {
  try { fs.appendFileSync(path.join(__dirname, '..', 'data', 'hook-errors.log'), new Date().toISOString() + ' ' + (e && e.stack || e) + '\n'); } catch {}
}
process.exit(0);
