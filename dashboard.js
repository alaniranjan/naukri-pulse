// dashboard.js
// Small local web dashboard: edit settings.json, see runs.json history,
// and start a run with one click. No extra packages.
//
// Usage:  npm run dashboard   then open http://localhost:3100
//
// It listens on 127.0.0.1 only, so other computers on your network cannot open it.

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

// Load .env if it exists (for DASHBOARD_PORT, TG_TOKEN, ...).
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  /* no .env file - that's fine */
}

const { SCHEDULE, LIMITS, todayKey, sameSkill, loadRuns, recordRun, saveSettings, validateSettings } = require('./settings');

const HOST = '127.0.0.1';
const PORT = Number(process.env.DASHBOARD_PORT) || 3100;
const PAGE = path.join(__dirname, 'dashboard.html');
const MAX_LOG = 100000;
const SESSION_FILE = path.join(__dirname, 'naukri-session.json');
const JOBS_DIR = path.join(__dirname, 'jobs');

// The one job that may be running (a Naukri run or apply-profile).
let job = null;

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 200000) reject(new Error('Request too large.'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// Only accept changes from this dashboard page (blocks other websites from posting here).
function isTrustedWrite(req) {
  const type = req.headers['content-type'] || '';
  const origin = req.headers.origin;
  const allowed = [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  return type.startsWith('application/json') && (!origin || allowed.includes(origin));
}

function readSettingsRaw() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'settings.json'), 'utf8'));
}

function jobInfo() {
  if (!job) return null;
  const { name, startedAt, endedAt, running, exitCode, log } = job;
  return { name, startedAt, endedAt, running, exitCode, log };
}

// onSuccess runs only if the job exits with code 0.
function startJob(name, args, onSuccess) {
  if (job && job.running) return false;
  job = { name, startedAt: new Date().toISOString(), running: true, exitCode: null, log: '' };
  const current = job;
  const child = spawn(process.execPath, args, { cwd: __dirname, env: process.env });
  const append = (chunk) => {
    current.log = (current.log + chunk.toString()).slice(-MAX_LOG);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  child.on('error', (err) => append(`\nCould not start: ${err.message}\n`));
  child.on('close', (code) => {
    current.running = false;
    current.exitCode = code;
    current.endedAt = new Date().toISOString();
    if (code === 0 && onSuccess) onSuccess();
  });
  return true;
}

// A new login may be a different Naukri account, so the rotation starts fresh
// (otherwise Friday could remove a skill that belongs to the other account).
function resetRotation(reason) {
  const runs = loadRuns();
  runs.state = { rotationIndex: 0, addedSkill: null };
  recordRun(runs, { at: new Date().toISOString(), day: 'account', task: reason, ok: true, detail: 'Rotation state reset.' });
}

function accountInfo() {
  const exists = fs.existsSync(SESSION_FILE);
  return {
    loggedIn: exists,
    savedAt: exists ? fs.statSync(SESSION_FILE).mtime.toISOString() : null,
    // If this is set in .env, the scripts use it instead of the saved file.
    envSession: Boolean((process.env.NAUKRI_SESSION_B64 || '').trim()),
  };
}

function status() {
  const runs = loadRuns();
  let nextSkill = null;
  try {
    const s = readSettingsRaw();
    const pool = s.rotatingSkills || [];
    for (let k = 0; k < pool.length && !nextSkill; k++) {
      const skill = pool[(runs.state.rotationIndex + k) % pool.length];
      if (!(s.coreSkills || []).some((c) => sameSkill(c, skill))) nextSkill = skill;
    }
  } catch {
    /* settings unreadable - shown on the Settings tab */
  }
  return {
    today: todayKey(),
    schedule: SCHEDULE,
    limits: LIMITS,
    state: runs.state,
    nextSkill,
    account: accountInfo(),
    job: jobInfo(),
  };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return fs.createReadStream(PAGE).pipe(res);
  }
  if (route === 'GET /api/status') return sendJson(res, 200, status());
  if (route === 'GET /api/settings') return sendJson(res, 200, readSettingsRaw());
  if (route === 'GET /api/runs') return sendJson(res, 200, loadRuns());

  // Job search results (jobs/jobs.json) and file downloads from the jobs/ folder.
  if (route === 'GET /api/jobs') {
    const file = path.join(JOBS_DIR, 'jobs.json');
    if (!fs.existsSync(file)) return sendJson(res, 200, { jobs: [] });
    return sendJson(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  if (req.method === 'GET' && url.pathname.startsWith('/jobs/')) {
    const name = path.basename(decodeURIComponent(url.pathname));
    const file = path.join(JOBS_DIR, name);
    const types = { '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv; charset=utf-8' };
    const type = types[path.extname(name).toLowerCase()];
    if (!type || !fs.existsSync(file)) return sendJson(res, 404, { error: 'File not found.' });
    res.writeHead(200, { 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"` });
    return fs.createReadStream(file).pipe(res);
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    if (!isTrustedWrite(req)) return sendJson(res, 403, { error: 'Not allowed.' });
    const body = await readBody(req);

    if (route === 'PUT /api/settings') {
      const errors = saveSettings(body);
      return errors.length ? sendJson(res, 400, { errors }) : sendJson(res, 200, { ok: true });
    }

    if (route === 'POST /api/run') {
      const day = String(body.day || '').toLowerCase();
      if (day && !SCHEDULE[day]) return sendJson(res, 400, { error: 'Unknown day.' });
      const args = ['naukri.js'];
      if (day) args.push(`--task=${day}`);
      const label = day ? `Run ${day.toUpperCase()} task` : "Run today's task";
      return startJob(label, args) ? sendJson(res, 200, { ok: true }) : sendJson(res, 409, { error: 'A run is already in progress.' });
    }

    if (route === 'POST /api/login') {
      return startJob('Log in to Naukri', ['save-session.js'], () => resetRotation('Logged in'))
        ? sendJson(res, 200, { ok: true })
        : sendJson(res, 409, { error: 'Something is already running. Wait for it to finish.' });
    }

    if (route === 'POST /api/logout') {
      if (job && job.running) return sendJson(res, 409, { error: 'Something is running. Wait for it to finish.' });
      if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE);
      resetRotation('Logged out');
      return sendJson(res, 200, { ok: true });
    }

    if (route === 'POST /api/apply') {
      const errors = validateSettings(readSettingsRaw());
      if (errors.length) return sendJson(res, 400, { errors });
      return startJob('Apply settings to profile', ['apply-profile.js'])
        ? sendJson(res, 200, { ok: true })
        : sendJson(res, 409, { error: 'A run is already in progress.' });
    }
  }

  sendJson(res, 404, { error: 'Not found.' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => sendJson(res, 500, { error: err.message }));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Pick another one, e.g.  DASHBOARD_PORT=3200 npm run dashboard`);
  } else {
    console.error(err.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Dashboard running: http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
