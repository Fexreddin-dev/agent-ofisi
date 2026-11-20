#!/usr/bin/env node
// Agent Ofisi — command-line tool for Atlas (and you).
//   node tools/ofis.js lovhe            pending/active tasks
//   node tools/ofis.js qutu <işçi>      an agent's open tasks
//   node tools/ofis.js elave <işçi> <mətn...>   new task (from Atlas)
//   node tools/ofis.js gotur <T-n>      mark task active
//   node tools/ofis.js bitdi <T-n> [nəticə...] | blok <T-n> <səbəb...> | gozle <T-n> <səbəb...>
//   node tools/ofis.js novbe basla sehər|gece [bitmə saatı HH:MM]   |  novbe bitir
//   node tools/ofis.js hesabat          write the shift report skeleton (data/reports)
//   node tools/ofis.js sync             Lab feedback → board + judge data
//   node tools/ofis.js status <işçi> <boşdur|işləyir|gözləyir|bloklanıb> [qeyd]
'use strict';
const path = require('path');
const fs = require('fs');
const S = require(path.join(__dirname, '..', 'lib', 'store.js'));
S.ensureDirs();

const [cmd, ...args] = process.argv.slice(2);
const out = (s) => process.stdout.write(s + '\n');
const ST = { pending: 'gözləyir', active: 'gedir', done: 'bitdi', waiting: 'səni gözləyir', blocked: 'bloklanıb' };

function showTasks(list) {
  if (!list.length) return out('(boşdur)');
  for (const t of list) out(`${t.id}  [${ST[t.status] || t.status}]  ${t.from} → ${t.to}: ${t.text.replace(/\s+/g, ' ').slice(0, 160)}`);
}

function statusKey(s) {
  const n = S.norm(s);
  if (n.startsWith('bos') || n === 'idle') return 'idle';
  if (n.startsWith('isle') || n === 'working') return 'working';
  if (n.includes('gozle') || n === 'waiting') return 'waiting';
  if (n.startsWith('blok') || n === 'blocked') return 'blocked';
  return null;
}

function shiftReport() {
  const shift = S.readJSON(S.P.shift, null);
  const since = shift && shift.start ? new Date(shift.start) : new Date(Date.now() - 12 * 3600e3);
  const j = S.getJournal(5000).filter((e) => new Date(e.t) >= since).reverse();
  const board = S.getBoard().tasks;
  const done = j.filter((e) => e.type === 'done');
  const hand = j.filter((e) => e.type === 'handoff');
  const name = (id) => (S.resolveAgent(id) || { ad: id }).ad;
  const waiting = board.filter((t) => t.status === 'waiting' || t.status === 'blocked');
  const pending = board.filter((t) => t.status === 'pending' || t.status === 'active');
  const kind = shift ? (shift.kind === 'gece' ? 'Gecə növbəsi' : 'Səhər növbəsi') : 'Hesabat';
  const lines = [
    `# ${kind} — ${S.localStamp()}`,
    '',
    `Növbə: ${shift ? S.localStamp(new Date(shift.start)) : '?'} → ${S.localStamp()}`,
    '',
    '## Qısa xülasə (Atlas yazır)',
    '',
    '_(Atlas: 3–5 cümlə: nə edildi, nə alınmadı, səni nə gözləyir, limit vəziyyəti.)_',
    '',
    `## Bitən işlər (${done.length})`,
    ...done.map((e) => `- **${name(e.from)}** ${e.task ? '(' + e.task + ')' : ''}: ${e.text || ''}${e.status && e.status !== 'idle' ? ' — _' + (S.STATUS[e.status] || e.status) + '_' : ''}`),
    '',
    `## Ötürmələr (${hand.length})`,
    ...hand.map((e) => `- ${name(e.from)} → ${name(e.to)} (${e.task}): ${e.text || ''}`),
    '',
    `## Səni gözləyən / bloklanan (${waiting.length})`,
    ...waiting.map((t) => `- ${t.id} ${name(t.to)}: ${t.text.slice(0, 160)}${t.result ? ' — ' + t.result.slice(0, 200) : ''}`),
    '',
    `## Lövhədə qalan (${pending.length})`,
    ...pending.map((t) => `- ${t.id} ${name(t.to)} [${ST[t.status]}]: ${t.text.slice(0, 160)}`),
    '',
  ];
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const file = path.join(S.P.reports, `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}-${shift && shift.kind === 'gece' ? 'gece' : 'seher'}.md`);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  S.journal({ type: 'report', from: 'atlas', text: path.basename(file) });
  return file;
}

try {
  switch (S.norm(cmd || '')) {
    case 'lovhe': case 'board':
      showTasks(S.getBoard().tasks.filter((t) => t.status === 'pending' || t.status === 'active'));
      break;
    case 'hamisi':
      showTasks(S.getBoard().tasks.slice(-50));
      break;
    case 'qutu': case 'inbox': {
      const a = S.resolveAgent(args[0]); if (!a) throw new Error('İşçi tapılmadı: ' + args[0]);
      showTasks(S.pendingFor(a.id));
      break;
    }
    case 'elave': case 'add': {
      const t = S.addTask({ to: args[0], from: 'atlas', text: args.slice(1).join(' '), source: 'atlas' });
      out(`${t.id} yaradıldı → ${t.to}`);
      break;
    }
    case 'gotur': S.updateTask(args[0], { status: 'active' }); out('ok'); break;
    case 'bitdi': S.updateTask(args[0], { status: 'done', result: args.slice(1).join(' ') || null }); out('ok'); break;
    case 'blok': S.updateTask(args[0], { status: 'blocked', result: args.slice(1).join(' ') }); out('ok'); break;
    case 'gozle': S.updateTask(args[0], { status: 'waiting', result: args.slice(1).join(' ') }); out('ok'); break;
    case 'status': {
      const a = S.resolveAgent(args[0]); const k = statusKey(args[1]);
      if (!a || !k) throw new Error('İstifadə: status <işçi> <boşdur|işləyir|gözləyir|bloklanıb> [qeyd]');
      S.setState(a.id, { status: k, note: args.slice(2).join(' ') || null });
      out('ok');
      break;
    }
    case 'novbe': case 'shift': {
      const sub = S.norm(args[0]);
      if (sub === 'basla') {
        const kind = S.norm(args[1]).startsWith('gec') ? 'gece' : 'seher';
        let end = args[2];
        if (!end) end = kind === 'gece' ? '09:00' : '19:00';
        S.writeJSON(S.P.shift, { kind, start: S.now(), end, active: true });
        S.journal({ type: 'shift', from: 'atlas', text: (kind === 'gece' ? 'Gecə' : 'Səhər') + ' növbəsi başladı, bitmə ' + end });
        out(`Növbə başladı: ${kind}, bitmə ${end}`);
      } else if (sub === 'bitir') {
        const s = S.readJSON(S.P.shift, {});
        S.writeJSON(S.P.shift, { ...s, active: false, ended: S.now() });
        S.journal({ type: 'shift', from: 'atlas', text: 'Növbə bitdi' });
        out('Növbə bitdi');
      } else if (sub === 'vaxt') {
        // prints "bitib" if the active shift's end time has passed
        const s = S.readJSON(S.P.shift, null);
        if (!s || !s.active) { out('növbə yoxdur'); break; }
        const [h, m] = String(s.end).split(':').map(Number);
        const st = new Date(s.start); const e = new Date(st); e.setHours(h, m || 0, 0, 0);
        if (e <= st) e.setDate(e.getDate() + 1);
        out(Date.now() >= e.getTime() ? 'bitib' : 'davam edir (' + Math.round((e - Date.now()) / 60000) + ' dəq qalıb)');
      } else out('istifadə: novbe basla seher|gece [HH:MM] | novbe bitir | novbe vaxt');
      break;
    }
    case 'hesabat': case 'report': out(shiftReport()); break;
    case 'sync': {
      const W = require(path.join(__dirname, '..', 'lib', 'lab.js'));
      const r = W.syncFeedback();
      out(`Lab rəyi: ${r.newCount} yeni (${r.bad} 👎 → Nova), gözlə təmiz şəkil: ${r.good}`);
      break;
    }
    default:
      out(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 13).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  }
} catch (e) { out('XƏTA: ' + e.message); process.exitCode = 1; }
