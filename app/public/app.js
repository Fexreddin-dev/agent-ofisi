/* Agent Ofisi — UI glue: live state (SSE), side panel, sheets, task form. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ST_AZ = { working: 'işləyir', waiting: 'səni gözləyir', blocked: 'bloklanıb', idle: 'boşdur' };
  const TASK_AZ = { pending: 'gözləyir', active: 'gedir', done: 'bitdi', waiting: 'səni gözləyir', blocked: 'bloklanıb' };
  let S = null;           // last state
  let openAgent = null;   // id in side panel
  let openSheet = null;   // sheet name
  let seenJournal = null; // newest journal timestamp we animated
  let draft = {};         // unsent task text per agent

  // ---------- helpers ----------
  function ago(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'indicə';
    if (s < 3600) return Math.floor(s / 60) + ' dəq əvvəl';
    if (s < 86400) return Math.floor(s / 3600) + ' saat əvvəl';
    return Math.floor(s / 86400) + ' gün əvvəl';
  }
  function hm(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }); }
  function dm(iso) { if (!iso) return ''; const d = new Date(iso); return d.toLocaleDateString('az-AZ', { day: '2-digit', month: '2-digit' }) + ' ' + hm(iso); }
  function agentById(id) { return S && S.agents.find((a) => a.id === id); }
  function nameOf(id) { const a = agentById(id); return a ? a.ad : ({ 'istifadəçi': 'Sən', lab: 'Lab', hakim: 'Hakim datası', 'çat': 'Çat', atlas: 'Atlas' }[id] || id); }
  function stOf(a) { return a.state.stale ? 'idle' : a.state.status || 'idle'; }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2600); }

  // ---------- theme ----------
  function applyTheme(name) {
    document.documentElement.dataset.theme = name;
    Office.setTheme(name);
    try { localStorage.setItem('ofis-theme', name); } catch (e) {}
  }
  $('#theme').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));

  // ---------- chips ----------
  function renderChips() {
    const c = { working: 0, waiting: 0, blocked: 0, idle: 0 };
    S.agents.forEach((a) => c[stOf(a)]++);
    const sh = S.shift && S.shift.active ? `<span class="chip"><span class="dot working"></span><b>${S.shift.kind === 'gece' ? 'Gecə' : 'Səhər'} növbəsi</b> ${hm(S.shift.start)} → ${esc(S.shift.end)}</span>` : '<span class="chip">Növbə yoxdur</span>';
    const g = S.gpu || {};
    const gpu = g.ok ? `<span class="chip" title="GPU: ${g.memUsed}/${g.memTotal} MB${g.labLock ? ' · Lab GPU işi gedir' : ''}${g.ofisLock ? ' · ' + esc(g.ofisLock.by || '') + ' GPU-dadır' : ''}">GPU <b>${g.temp}°C</b> ${g.util}%${g.labLock || g.ofisLock ? ' · məşğul' : ''}</span>` : '<span class="chip">GPU: məlumat yoxdur</span>';
    const open = S.board.filter((t) => t.status === 'pending' || t.status === 'active').length;
    $('#chips').innerHTML = sh +
      `<span class="chip"><span class="dot working"></span><b>${c.working}</b> işləyir</span>` +
      (c.waiting ? `<span class="chip"><span class="dot waiting"></span><b>${c.waiting}</b> səni gözləyir</span>` : '') +
      (c.blocked ? `<span class="chip"><span class="dot blocked"></span><b>${c.blocked}</b> bloklanıb</span>` : '') +
      `<span class="chip"><b>${open}</b> açıq tapşırıq</span>` + gpu;
  }

  // ---------- activity list (bottom-left): who is doing what + latest handoffs ----------
  function renderActivity() {
    const el = $('#activity'); if (!el) return;
    const busy = S.agents.filter((a) => a.subagent !== false && stOf(a) !== 'idle' || (a.id === 'atlas' && stOf(a) === 'working'));
    const rows = busy.map((a) => {
      const st = stOf(a);
      const what = st === 'working' ? (a.state.step ? a.state.step.text : a.state.task || 'işləyir') : (a.state.task || ST_AZ[st]);
      return `<li><button type="button" data-ag="${esc(a.id)}"><span class="dot ${st}"></span><span class="who">${esc(a.ad)} <span class="ago">${esc(ST_AZ[st])}</span></span><span class="what">${esc(what)}</span></button></li>`;
    });
    const hand = (S.journal || []).filter((e) => e.type === 'handoff' && e.from && e.to).slice(0, 3).map((e) =>
      `<li><button type="button" data-ag="${esc(e.to)}"><span class="dot waiting"></span><span class="who">${esc(nameOf(e.from))} <span class="arrow">→</span> ${esc(nameOf(e.to))}<span class="ago">${esc(ago(e.t))}</span></span><span class="what">${esc(e.text || '')}</span></button></li>`);
    const n = busy.filter((a) => stOf(a) === 'working').length;
    const html = `<button type="button" class="act-head" aria-expanded="${actOpen}"><span>Kim nə edir</span><b>${n} işləyir</b><span class="chev" aria-hidden="true">${actOpen ? '–' : '+'}</span></button><div class="act-body"><h3>İndi</h3><ul>${rows.join('') || '<li class="what" style="padding:4px 6px;color:var(--text-3)">Hamı boşdur</li>'}</ul>` +
      (hand.length ? `<h3>Son ötürmələr</h3><ul>${hand.join('')}</ul>` : '') + '</div>';
    el.classList.toggle('open', actOpen);
    if (el._h !== html) { el._h = html; el.innerHTML = html; }
  }
  const wide = () => window.innerWidth >= 1100;
  let actOpen = wide();
  try { const v = localStorage.getItem('ofis-activity'); if (v && wide()) actOpen = v === '1'; } catch (e) {}
  function layoutActivity() { if (window.Office) Office.setInset(actOpen && wide() ? 356 : 0); }
  window.addEventListener('resize', () => { if (!wide() && actOpen) { actOpen = false; if (S) renderActivity(); } layoutActivity(); });
  document.addEventListener('click', (e) => {
    const h = e.target.closest && e.target.closest('#activity .act-head');
    if (h) { actOpen = !actOpen; try { localStorage.setItem('ofis-activity', actOpen ? '1' : '0'); } catch (er) {} renderActivity(); layoutActivity(); return; }
    const b = e.target.closest && e.target.closest('#activity [data-ag]');
    if (b && agentById(b.dataset.ag)) openPanel(b.dataset.ag);
  });

  // ---------- side panel ----------
  async function openPanel(id) {
    openAgent = id;
    Office.select(id);
    if (!id) { $('#panel').hidden = true; return; }
    $('#panel').hidden = false;
    await refreshPanel();
  }
  async function refreshPanel() {
    if (!openAgent) return;
    const id = openAgent;
    let d;
    try { d = await (await fetch('/api/agent/' + encodeURIComponent(id))).json(); } catch (e) { return; }
    if (openAgent !== id || !d || d.error) return;
    const p = $('#panel');
    const ta = p.querySelector('textarea');
    if (ta) draft[id] = ta.value;
    const hadFocus = document.activeElement === ta;
    const s = d.state || {};
    const st = s.status || 'idle';
    const steps = (s.steps || []).slice(0, 14);
    const files = (s.files || []).slice(0, 14);
    const hist = (d.history || []).slice(0, 15);
    const open = d.open || [];
    p.innerHTML = `
      <div class="p-head">
        <div class="avatar" style="background:${esc(d.reng)}">${esc(d.ad[0])}</div>
        <div>
          <h2>${esc(d.ad)}</h2>
          <div class="role">${esc(d.is)}</div>
          <div class="meta"><span class="chip"><span class="dot ${st}"></span>${ST_AZ[st]}${s.since ? ' · ' + ago(s.since) : ''}</span><span class="chip">model: <b>${esc(d.model)}</b></span></div>
        </div>
        <button class="btn icon close" aria-label="Paneli bağla" data-close>✕</button>
      </div>
      <div class="p-body">
        <div class="sec"><h3>İndi</h3>
          ${s.task ? `<div class="now-box"><div class="t">${s.taskId ? esc(s.taskId) + ' · ' : ''}${esc(s.task)}</div>${steps[0] ? `<div class="s">${esc(steps[0].text)} · ${ago(steps[0].t)}</div>` : ''}</div>`
            : `<div class="now-box"><div class="t">${st === 'idle' ? 'Boşdur' : ST_AZ[st]}</div>${s.lastResult ? `<div class="s">Son nəticə: ${esc(s.lastResult)}</div>` : ''}${s.note ? `<div class="s">${esc(s.note)}</div>` : ''}</div>`}
        </div>
        ${open.length ? `<div class="sec"><h3>Gələn işlər (${open.length})</h3><div class="hist">${open.map((t) => `<div class="h"><div class="top"><span>${esc(t.id)} · ${esc(nameOf(t.from))}dən</span><span>${TASK_AZ[t.status]} · ${ago(t.created)}</span></div><div class="res">${esc(t.text)}</div></div>`).join('')}</div></div>` : ''}
        <div class="sec"><h3>Son addımlar</h3>${steps.length ? `<ul class="list">${steps.map((x) => `<li><time>${hm(x.t)}</time><span>${esc(x.text)}</span></li>`).join('')}</ul>` : '<div class="empty">Hələ addım yoxdur.</div>'}</div>
        <div class="sec"><h3>Dəyişdirdiyi fayllar</h3>${files.length ? `<div class="files">${files.map((f) => `<span>${esc(f)}</span>`).join('')}</div>` : '<div class="empty">Hələ fayl dəyişməyib.</div>'}</div>
        <div class="sec"><h3>Tarixçə</h3>${hist.length ? `<div class="hist">${hist.map((h) => `<div class="h"><div class="top"><span>${dm(h.t)}${h.taskId ? ' · ' + esc(h.taskId) : ''}</span><span>${h.status && h.status !== 'idle' ? ST_AZ[h.status] : 'bitdi'}${h.next ? ' → ' + esc(nameOf(h.next)) : ''}</span></div>${h.task ? `<div class="task">${esc(h.task)}</div>` : ''}<div class="res">${esc(h.result || '')}</div></div>`).join('')}</div>` : '<div class="empty">Hələ bitmiş iş yoxdur.</div>'}</div>
      </div>
      <form class="form" id="taskForm">
        <label for="taskText">${esc(d.ad)} üçün tapşırıq qutusu</label>
        <textarea id="taskText" maxlength="4000" placeholder="${esc(d.cagir || 'Tapşırığı yaz...')}"></textarea>
        <div class="row"><span class="small">Bu çat deyil: yazdığın lövhəyə tapşırıq kimi düşür. Atlas onu növbədə və ya çatda “lövhəni işlə” deyəndə görür, cavab “Tarixçə”də görünür. Sual vermək üçün Claude Code çatına yaz.</span><button class="btn primary" type="submit">Göndər</button></div>
      </form>`;
    const nta = p.querySelector('textarea');
    nta.value = draft[id] || '';
    if (hadFocus) { nta.focus(); nta.setSelectionRange(nta.value.length, nta.value.length); }
    p.querySelector('[data-close]').onclick = () => openPanel(null);
    p.querySelector('#taskForm').onsubmit = (e) => { e.preventDefault(); sendTask(id, nta.value, () => { draft[id] = ''; nta.value = ''; }); };
    nta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) p.querySelector('#taskForm').requestSubmit(); });
  }

  async function sendTask(to, text, ok) {
    text = String(text || '').trim();
    if (!text) { toast('Tapşırıq boşdur'); return; }
    try {
      const r = await fetch('/api/task', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, text }) });
      const j = await r.json();
      if (!r.ok) { toast(j.error || 'Göndərilmədi'); return; }
      toast(`${j.task.id} → ${nameOf(j.task.to)}: lövhəyə düşdü. Nəticə “Tarixçə”də görünəcək.`);
      Office.flow('panel', j.task.to, 'call');
      ok && ok();
    } catch (e) { toast('Server cavab vermir'); }
  }

  // ---------- sheets ----------
  function setSheet(name) {
    openSheet = openSheet === name ? null : name;
    document.querySelectorAll('[data-sheet]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sheet === openSheet)));
    renderSheet(true);
  }
  document.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => setSheet(b.dataset.sheet)));

  function renderSheet(force) {
    const el = $('#sheet');
    if (!openSheet || !S) { el.hidden = true; return; }
    if (!force && el.contains(document.activeElement) && /textarea|input|select/i.test(document.activeElement.tagName)) return;
    el.hidden = false;
    const titles = { agents: 'Agentlər', board: 'Tapşırıq lövhəsi', journal: 'Jurnal: kim kimə nə ötürdü', reports: 'Növbə hesabatları' };
    let body = '';
    if (openSheet === 'agents') {
      body = `<table><thead><tr><th>Ad</th><th>İş</th><th>Model</th><th>Necə çağırılır</th></tr></thead><tbody>${S.agents.map((a) => `
        <tr class="click" data-agent="${esc(a.id)}"><td><span class="who"><span class="dot ${stOf(a)}"></span>${esc(a.ad)}</span></td><td>${esc(a.is)}</td><td><code>${esc(a.model)}</code></td><td>${a.subagent ? `Çatda: <code>${esc(a.cagir)}</code><br><span class="empty">və ya bu paneldən tapşırıq</span>` : esc(a.cagir)}</td></tr>`).join('')}</tbody></table>`;
    } else if (openSheet === 'board') {
      const t = S.board.slice().reverse();
      const col = (title, dot, list) => `<div class="col"><h3>${dot ? `<span class="dot ${dot}"></span>` : ''}${title} (${list.length})</h3>${list.length ? list.map((x) => `<div class="card"><div class="top"><span>${esc(x.id)} · ${esc(nameOf(x.from))} → <b>${esc(nameOf(x.to))}</b></span><span>${ago(x.updated)}</span></div><div class="txt">${esc(x.text)}</div>${x.result ? `<div class="res">${esc(x.result)}</div>` : ''}</div>`).join('') : '<div class="empty">—</div>'}</div>`;
      const opts = S.agents.filter((a) => a.subagent || a.id === 'atlas').map((a) => `<option value="${esc(a.id)}">${esc(a.ad)}</option>`).join('');
      body = `<form class="newtask" id="boardForm"><select id="bfTo" aria-label="İşçi">${opts}</select><textarea id="bfText" maxlength="4000" placeholder="Yeni tapşırıq..." aria-label="Tapşırıq"></textarea><button class="btn primary" type="submit">Göndər</button></form>
        <div class="cols">${col('Gözləyir', 'idle', t.filter((x) => x.status === 'pending'))}${col('Gedir', 'working', t.filter((x) => x.status === 'active'))}${col('Səni gözləyir', 'waiting', t.filter((x) => x.status === 'waiting' || x.status === 'blocked'))}${col('Bitdi', '', t.filter((x) => x.status === 'done').slice(0, 30))}</div>`;
    } else if (openSheet === 'journal') {
      const IC = { task: '✚', call: '→', handoff: '⇄', done: '✓', lab: '◐', shift: '◷', report: '▤' };
      body = S.journal.length ? S.journal.map((e) => {
        let tx = '';
        if (e.type === 'task') tx = `<b>${esc(nameOf(e.from))}</b> → <b>${esc(nameOf(e.to))}</b>: ${esc(e.text)}`;
        else if (e.type === 'call') tx = `<b>${esc(nameOf(e.from))}</b> çağırdı <b>${esc(nameOf(e.to))}</b>${e.project ? ' (' + esc(e.project) + ')' : ''}: ${esc(e.text)}`;
        else if (e.type === 'handoff') tx = `<b>${esc(nameOf(e.from))}</b> ötürdü <b>${esc(nameOf(e.to))}</b>-a: ${esc(e.text)}`;
        else if (e.type === 'done') tx = `<b>${esc(nameOf(e.from))}</b> bitirdi${e.status && e.status !== 'idle' ? ' (' + ST_AZ[e.status] + ')' : ''}: ${esc(e.text)}`;
        else tx = `<b>${esc(nameOf(e.from))}</b>: ${esc(e.text)}`;
        return `<div class="jr"><time>${dm(e.t)}</time><span class="ic" aria-hidden="true">${IC[e.type] || '•'}</span><span class="tx">${tx}${e.task ? ` <span class="empty">${esc(e.task)}</span>` : ''}</span></div>`;
      }).join('') : '<div class="empty">Jurnal hələ boşdur.</div>';
    } else if (openSheet === 'reports') {
      body = S.reports.length ? `<div class="rep-list">${S.reports.map((r) => `<button class="btn" data-rep="${esc(r)}">${esc(r)}</button>`).join('')}</div><div class="md" id="repView"></div>` : '<div class="empty">Hələ hesabat yoxdur. Növbə bitəndə Atlas burada hesabat yazır.</div>';
    }
    const keepScroll = el.querySelector('.s-body') ? el.querySelector('.s-body').scrollTop : 0;
    const keepRep = el.querySelector('#repView') ? el.querySelector('#repView').innerHTML : '';
    el.innerHTML = `<div class="s-head"><h2>${titles[openSheet]}</h2><button class="btn icon close" aria-label="Bağla" data-close>✕</button></div><div class="s-body">${body}</div>`;
    el.querySelector('.s-body').scrollTop = keepScroll;
    if (keepRep && el.querySelector('#repView')) el.querySelector('#repView').innerHTML = keepRep;
    el.querySelector('[data-close]').onclick = () => setSheet(openSheet);
    el.querySelectorAll('[data-agent]').forEach((r) => r.addEventListener('click', () => { openPanel(r.dataset.agent); Office.focus(r.dataset.agent); }));
    el.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', async () => {
      const txt = await (await fetch('/api/report/' + encodeURIComponent(b.dataset.rep))).text();
      el.querySelector('#repView').innerHTML = md(txt);
    }));
    const bf = el.querySelector('#boardForm');
    if (bf) bf.onsubmit = (e) => { e.preventDefault(); sendTask(el.querySelector('#bfTo').value, el.querySelector('#bfText').value, () => { el.querySelector('#bfText').value = ''; }); };
  }

  function md(src) {
    const out = []; let inList = false;
    for (const raw of src.split('\n')) {
      const l = esc(raw).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<i>$1</i>');
      if (/^- /.test(raw)) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + l.slice(2) + '</li>'); continue; }
      if (inList) { out.push('</ul>'); inList = false; }
      if (/^# /.test(raw)) out.push('<h1>' + l.slice(2) + '</h1>');
      else if (/^## /.test(raw)) out.push('<h2>' + l.slice(3) + '</h2>');
      else if (raw.trim()) out.push('<p>' + l + '</p>');
    }
    if (inList) out.push('</ul>');
    return out.join('');
  }

  // ---------- live state ----------
  function onState(st) {
    const first = !S;
    S = st;
    window.__gpu = st.gpu;
    Office.setAgents(st.agents);
    renderChips();
    renderActivity();
    // animate new journal events (oldest first)
    const newest = st.journal[0] ? st.journal[0].t : null;
    if (!first && seenJournal) {
      const fresh = st.journal.filter((e) => e.t > seenJournal).reverse();
      for (const e of fresh) {
        if ((e.type === 'handoff' || e.type === 'task' || e.type === 'call') && e.to) Office.flow(e.from === 'çat' ? 'panel' : e.from, e.to, e.type === 'call' ? 'call' : e.from === 'lab' ? 'lab' : 'handoff');
        else if (e.type === 'lab' && e.to) Office.flow('lab', e.to === 'hakim' ? 'hakim' : e.to, 'lab');
      }
    }
    if (newest) seenJournal = newest;
    if (openAgent) refreshPanel();
    renderSheet(false);
  }

  function connect() {
    const live = $('#live');
    const es = new EventSource('/api/events');
    es.addEventListener('state', (e) => { live.className = 'live on'; live.textContent = 'canlı'; onState(JSON.parse(e.data)); });
    es.onerror = () => { live.className = 'live'; live.textContent = 'server bağlıdır, son vəziyyət göstərilir'; };
  }

  // ---------- boot ----------
  Office.init($('#cv'), $('#labels'));
  applyTheme(document.documentElement.dataset.theme || 'dark');
  Office.onSelect((id) => openPanel(id));
  layoutActivity();
  $('#rotL').onclick = () => Office.rotate(-Math.PI / 4);
  $('#rotR').onclick = () => Office.rotate(Math.PI / 4);
  $('#zin').onclick = () => Office.zoom(1.2);
  $('#zout').onclick = () => Office.zoom(1 / 1.2);
  $('#reset').onclick = () => Office.reset();
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (openAgent) openPanel(null); else if (openSheet) setSheet(openSheet); } });
  fetch('/api/state').then((r) => r.json()).then(onState).catch(() => {});
  connect();
  setInterval(() => { if (S) renderChips(); }, 30000);
})();
