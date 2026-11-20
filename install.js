#!/usr/bin/env node
// Agent Ofisi installer — Node built-ins only, no downloads.
//   node install.js            install (agents + skills + hooks + data folders)
//   node install.js --force    also overwrite agents/skills that already exist (old copies are backed up)
//   node install.js --uninstall  remove the office hooks and the agents this repo installed
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const OFIS = __dirname;
const OFIS_FWD = OFIS.replace(/\\/g, '/');
const CLAUDE = path.join(os.homedir(), '.claude');
const AGENTS_DST = path.join(CLAUDE, 'agents');
const SKILLS_DST = path.join(CLAUDE, 'skills');
const SETTINGS = path.join(CLAUDE, 'settings.json');
const HOOK_CMD = `node "${OFIS_FWD}/hooks/ofis-hook.js"`;
const EVENTS = {
  PreToolUse: 'Agent|Task', PostToolUse: '*', PostToolUseFailure: '*',
  SubagentStart: null, SubagentStop: null, UserPromptSubmit: null, Notification: null, Stop: null,
};
const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const ok = (m) => console.log('  ✓ ' + m);
const skip = (m) => console.log('  · ' + m);

function major() { return Number(process.versions.node.split('.')[0]); }
if (major() < 18) { console.error('Node 18 və ya daha yeni lazımdır (sizdə ' + process.versions.node + ').'); process.exit(1); }

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return {};
  try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); }
  catch (e) { console.error('~/.claude/settings.json oxunmadı (JSON səhvi). Əvvəlcə onu düzəldin.'); process.exit(1); }
}
function writeSettings(s) {
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, `${SETTINGS}.bak-agent-ofisi-${stamp}`);
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n', 'utf8');
}
const isOurs = (h) => h && typeof h.command === 'string' && /hooks[\\/]+ofis-hook\.js/.test(h.command);

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function install() {
  console.log('\nAgent Ofisi quraşdırılır: ' + OFIS + '\n');

  // 1) agents
  console.log('İşçilər → ' + AGENTS_DST);
  fs.mkdirSync(AGENTS_DST, { recursive: true });
  for (const f of fs.readdirSync(path.join(OFIS, 'agents')).filter((x) => x.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(OFIS, 'agents', f), 'utf8').split('{{OFIS}}').join(OFIS_FWD);
    const dst = path.join(AGENTS_DST, f);
    if (fs.existsSync(dst)) {
      if (fs.readFileSync(dst, 'utf8') === text) { skip(f + ' (eynidir)'); continue; }
      if (!force) { skip(f + ' artıq var, toxunulmadı (üzərinə yazmaq üçün --force)'); continue; }
      fs.copyFileSync(dst, `${dst}.bak-${stamp}`);
    }
    fs.writeFileSync(dst, text, 'utf8'); ok(f);
  }

  // 2) skills (optional folder)
  const skillsSrc = path.join(OFIS, 'skills');
  if (fs.existsSync(skillsSrc)) {
    console.log('\nSkill-lər → ' + SKILLS_DST);
    for (const e of fs.readdirSync(skillsSrc, { withFileTypes: true }).filter((x) => x.isDirectory())) {
      const dst = path.join(SKILLS_DST, e.name);
      if (fs.existsSync(dst) && !force) { skip(e.name + ' artıq var, toxunulmadı'); continue; }
      if (fs.existsSync(dst)) fs.renameSync(dst, `${dst}.bak-${stamp}`);
      copyDir(path.join(skillsSrc, e.name), dst); ok(e.name);
    }
  }

  // 3) hooks in ~/.claude/settings.json (a backup is written next to it)
  console.log('\nHook-lar → ' + SETTINGS);
  const s = readSettings();
  s.hooks = s.hooks || {};
  let changed = false;
  for (const [ev, matcher] of Object.entries(EVENTS)) {
    const list = (s.hooks[ev] = s.hooks[ev] || []);
    // drop stale entries that point to another copy of the office
    for (const g of list) if (Array.isArray(g.hooks)) {
      const before = g.hooks.length;
      g.hooks = g.hooks.filter((h) => !isOurs(h) || h.command === HOOK_CMD);
      if (g.hooks.length !== before) changed = true;
    }
    s.hooks[ev] = list.filter((g) => !Array.isArray(g.hooks) || g.hooks.length);
    if (s.hooks[ev].some((g) => (g.hooks || []).some((h) => h.command === HOOK_CMD))) { skip(ev + ' (var)'); continue; }
    const entry = { hooks: [{ type: 'command', command: HOOK_CMD, timeout: 10 }] };
    if (matcher) entry.matcher = matcher;
    s.hooks[ev].push(entry); changed = true; ok(ev);
  }
  if (changed) writeSettings(s);

  // 4) data folders + config
  require(path.join(OFIS, 'lib', 'store.js')).ensureDirs();
  const cfg = path.join(OFIS, 'config.json');
  if (!fs.existsSync(cfg)) fs.copyFileSync(path.join(OFIS, 'config.example.json'), cfg);
  console.log('');
  ok('data/, out/ və config.json hazırdır');

  console.log(`
Hazırdır. İndi:
  1) Ofisi aç:  ${process.platform === 'win32' ? 'Ofis.bat (iki dəfə klik)' : './ofis.sh'}  →  http://127.0.0.1:8770
  2) Claude Code-u bu qovluqda aç (yeni çat). Bu çat "Atlas"-dır — müdir.
  3) Yaz:  "Keeper, Kokoro TTS-in lisenziyasını yoxla"  və ya  "səhər növbəsini başla"
`);
}

function uninstall() {
  console.log('\nAgent Ofisi silinir (fayllarınız və data/ qovluğu qalır)\n');
  const s = readSettings();
  if (s.hooks) {
    for (const ev of Object.keys(s.hooks)) {
      s.hooks[ev] = (s.hooks[ev] || []).map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) })).filter((g) => g.hooks.length);
      if (!s.hooks[ev].length) delete s.hooks[ev];
    }
    writeSettings(s); ok('hook-lar silindi');
  }
  for (const f of fs.readdirSync(path.join(OFIS, 'agents')).filter((x) => x.endsWith('.md'))) {
    const dst = path.join(AGENTS_DST, f);
    const ours = fs.readFileSync(path.join(OFIS, 'agents', f), 'utf8').split('{{OFIS}}').join(OFIS_FWD);
    if (fs.existsSync(dst) && fs.readFileSync(dst, 'utf8') === ours) { fs.unlinkSync(dst); ok(f + ' silindi'); }
    else if (fs.existsSync(dst)) skip(f + ' dəyişdirilib, saxlanıldı');
  }
  console.log('\nBitdi. Claude Code-u yenidən başladın.\n');
}

if (args.has('--uninstall')) uninstall(); else install();
