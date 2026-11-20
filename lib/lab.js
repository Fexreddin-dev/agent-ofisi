// Agent Ofisi ↔ Lab bridge (optional). Read-only toward the Lab: it only READS <labOutputs>/lab_eye.json
// and APPENDS each user verdict to <labOutputs>/<feedbackFile>. Configure in config.json (see config.example.json);
// without labOutputs the bridge is simply off.
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const S = require('./store.js');

const CFG = S.readJSON(path.join(S.ROOT, 'config.json'), {});
const OUTS = CFG.labOutputs ? path.resolve(S.ROOT, CFG.labOutputs) : path.join(S.DATA, 'lab-off');
const BAD_TO = CFG.labBadTo || 'nova';
const EYE = path.join(OUTS, 'lab_eye.json');
const JUDGE = path.join(OUTS, CFG.feedbackFile || 'lab_user_feedback.jsonl');
const LAB_LOCK = path.join(OUTS, 'lab.lock');
const SEEN = path.join(S.DATA, CFG.seenFile || 'lab-seen.json');
const GOOD = path.join(S.DATA, CFG.goodFile || 'lab-good.json');

function syncFeedback() {
  const res = { newCount: 0, bad: 0, good: 0, available: fs.existsSync(EYE) };
  if (!res.available) return res;
  const eye = S.readJSON(EYE, {});
  const seen = S.readJSON(SEEN, {});
  const good = [];
  for (const [key, v] of Object.entries(eye)) {
    if (!v || typeof v !== 'object') continue;
    if (v.verdict === 'good' && v.img) good.push({ key, img: v.img, note: v.note || '', by: v.by || '', time: v.time || '' });
    if (v.by !== 'user') continue; // only the user's own 👍/👎 flow into the system
    const sig = `${v.verdict}|${v.time}|${v.fp || ''}`;
    if (seen[key] === sig) continue;
    seen[key] = sig;
    res.newCount++;
    try {
      fs.appendFileSync(JUDGE, JSON.stringify({ key, verdict: v.verdict, note: v.note || '', img: v.img || null, fp: v.fp || null, time: v.time || null, source: 'lab-user', logged: S.now() }) + '\n', 'utf8');
    } catch {}
    S.journal({ type: 'lab', from: 'lab', to: v.verdict === 'bad' ? BAD_TO : 'hakim', text: `Lab ${v.verdict === 'bad' ? '👎' : '👍'} ${key}${v.note ? ': ' + v.note : ''}`.slice(0, 200) });
    if (v.verdict === 'bad') {
      res.bad++;
      try {
        S.addTask({
          to: BAD_TO, from: 'lab', source: 'handoff',
          text: `Lab 👎: ${key} — ${v.note || '(qeyd yoxdur)'}. Şəkil: ${v.img || '?'}. Şəklə 2×–3× bax, səbəbi tap, düzəlt və yenidən hazırla. Nəticəni Iris yoxlasın.`,
        });
      } catch {}
    }
  }
  S.writeJSON(SEEN, seen);
  S.writeJSON(GOOD, { _qeyd: 'Lab-da gözlə təmiz (good) deyilən kombinlər. SMM/Hue/Reel yalnız bunlardan istifadə edir.', updated: S.now(), items: good });
  res.good = good.length;
  return res;
}

let gpuCache = { t: 0, v: null };
function gpuStatus(cb) {
  if (Date.now() - gpuCache.t < 8000 && gpuCache.v) return cb(gpuCache.v);
  execFile('nvidia-smi', ['--query-gpu=temperature.gpu,utilization.gpu,memory.used,memory.total', '--format=csv,noheader,nounits'], { timeout: 4000, windowsHide: true }, (err, stdout) => {
    let v = { ok: false };
    if (!err && stdout) {
      const [temp, util, mu, mt] = stdout.trim().split('\n')[0].split(',').map((x) => Number(x.trim()));
      v = { ok: true, temp, util, memUsed: mu, memTotal: mt };
    }
    v.labLock = fs.existsSync(LAB_LOCK);
    v.ofisLock = S.readJSON(S.P.gpuLock, null);
    gpuCache = { t: Date.now(), v };
    cb(v);
  });
}

module.exports = { OUTS, EYE, JUDGE, syncFeedback, gpuStatus };
