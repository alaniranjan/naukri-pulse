// settings.js
// Reads and writes settings.json (your profile texts and skills)
// and runs.json (what the script changed, and when).
// Used by naukri.js, apply-profile.js and dashboard.js.

'use strict';

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, 'settings.json');
const RUNS_FILE = path.join(__dirname, 'runs.json');
const MAX_HISTORY = 200;

// The weekly plan. One small change per day. Weekdays are in IST.
const SCHEDULE = {
  mon: { task: 'toggleHeadlineStop', label: 'Toggle a trailing full stop in the headline' },
  tue: { task: 'headlineB', label: 'Swap headline to variant B' },
  wed: { task: 'addSkill', label: 'Add the next skill from the rotating pool' },
  thu: { task: 'toggleSummaryStop', label: 'Toggle a trailing full stop in the summary' },
  fri: { task: 'removeSkill', label: "Remove the skill added on Wednesday" },
  sat: { task: 'headlineC', label: 'Swap headline to variant C' },
  sun: { task: 'headlineBase', label: 'Return the headline to the base version' },
};

const LIMITS = { headline: 250, summary: 1000, skill: 60, maxSkills: 50 };

// Weekday key in India time: "mon", "tue", ...
function todayKey(date = new Date()) {
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Kolkata' }).slice(0, 3).toLowerCase();
}

function sameSkill(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Write to a temp file first, then rename, so a crash never leaves half a file.
function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// Returns a list of problems (empty list = settings are OK).
function validateSettings(s) {
  const errors = [];
  if (!s || typeof s !== 'object') return ['Settings must be a JSON object.'];

  const h = s.headlines || {};
  for (const key of ['base', 'variantB', 'variantC']) {
    const text = typeof h[key] === 'string' ? h[key].trim() : '';
    if (!text) errors.push(`Headline "${key}" is empty.`);
    else if (text.length > LIMITS.headline) errors.push(`Headline "${key}" is longer than ${LIMITS.headline} characters.`);
    else if (text.split(/\s+/).length < 5) errors.push(`Headline "${key}" needs at least 5 words (Naukri rule).`);
  }

  const summary = typeof s.summary === 'string' ? s.summary.trim() : '';
  if (!summary) errors.push('Summary is empty.');
  else if (summary.length > LIMITS.summary) errors.push(`Summary is longer than ${LIMITS.summary} characters.`);

  for (const key of ['coreSkills', 'rotatingSkills']) {
    const list = s[key];
    if (!Array.isArray(list)) {
      errors.push(`${key} must be a list.`);
      continue;
    }
    list.forEach((skill, i) => {
      if (typeof skill !== 'string' || !skill.trim()) errors.push(`${key} item ${i + 1} is empty.`);
      else if (skill.length > LIMITS.skill) errors.push(`${key}: "${skill}" is too long.`);
    });
    const seen = new Set();
    for (const skill of list.filter((x) => typeof x === 'string')) {
      const k = skill.trim().toLowerCase();
      if (seen.has(k)) errors.push(`${key}: "${skill}" is listed twice.`);
      seen.add(k);
    }
  }

  if (!Number.isInteger(s.maxSkills) || s.maxSkills < 1 || s.maxSkills > LIMITS.maxSkills) {
    errors.push(`maxSkills must be a whole number from 1 to ${LIMITS.maxSkills}.`);
  } else if (Array.isArray(s.coreSkills) && s.coreSkills.length >= s.maxSkills) {
    errors.push(`Too many core skills: keep them below maxSkills (${s.maxSkills}) so there is room to rotate.`);
  }

  return errors;
}

// Trim all texts so small typing mistakes don't reach Naukri.
function cleanSettings(s) {
  return {
    headlines: {
      base: s.headlines.base.trim(),
      variantB: s.headlines.variantB.trim(),
      variantC: s.headlines.variantC.trim(),
    },
    summary: s.summary.trim(),
    coreSkills: s.coreSkills.map((x) => x.trim()),
    rotatingSkills: s.rotatingSkills.map((x) => x.trim()),
    maxSkills: s.maxSkills,
  };
}

function loadSettings() {
  const s = readJson(SETTINGS_FILE, null);
  if (!s) throw new Error('settings.json not found.');
  const errors = validateSettings(s);
  if (errors.length) throw new Error('settings.json has problems:\n- ' + errors.join('\n- '));
  return cleanSettings(s);
}

function saveSettings(s) {
  const errors = validateSettings(s);
  if (errors.length) return errors;
  writeJson(SETTINGS_FILE, cleanSettings(s));
  return [];
}

// runs.json = { state: { rotationIndex, addedSkill }, history: [ ...newest last ] }
function loadRuns() {
  const runs = readJson(RUNS_FILE, {});
  return {
    state: { rotationIndex: 0, addedSkill: null, ...(runs.state || {}) },
    history: Array.isArray(runs.history) ? runs.history : [],
  };
}

function recordRun(runs, entry) {
  runs.history.push(entry);
  runs.history = runs.history.slice(-MAX_HISTORY);
  writeJson(RUNS_FILE, runs);
}

module.exports = {
  SCHEDULE,
  LIMITS,
  todayKey,
  sameSkill,
  validateSettings,
  loadSettings,
  saveSettings,
  loadRuns,
  recordRun,
};
