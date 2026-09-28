// apply-profile.js
// One-time (or whenever you change settings.json): copy your profile content to Naukri.
//   - Resume headline  -> the "base" headline
//   - Profile summary  -> the summary
//   - Key skills       -> adds any missing core skill (never removes your other skills)
//
// Usage:  npm run apply-profile

'use strict';

const { FIELDS, withNaukri, writeTextField, openSkillsEditor, readSkills, addSkillChip, saveSkills } = require('./naukri');
const { sameSkill, loadSettings, loadRuns, recordRun } = require('./settings');

async function applyProfile(page, settings) {
  const done = [];

  const h = await writeTextField(page, FIELDS.headline, () => settings.headlines.base);
  done.push(h.changed ? 'headline updated' : 'headline already correct');

  const s = await writeTextField(page, FIELDS.summary, () => settings.summary);
  done.push(s.changed ? 'summary updated' : 'summary already correct');

  await openSkillsEditor(page);
  const current = await readSkills(page);
  const missing = settings.coreSkills.filter((core) => !current.some((c) => sameSkill(c, core)));
  const room = settings.maxSkills - current.length;
  const toAdd = missing.slice(0, Math.max(0, room));

  for (const skill of toAdd) {
    await addSkillChip(page, skill);
    console.log(`  + ${skill}`);
  }
  if (toAdd.length) {
    await saveSkills(page, (shown) => toAdd.every((skill) => shown.some((x) => sameSkill(x, skill))));
    done.push(`${toAdd.length} core skill(s) added`);
  } else {
    done.push('core skills already present');
  }
  if (toAdd.length < missing.length) {
    done.push(`WARNING: no room for ${missing.length - toAdd.length} core skill(s) (max ${settings.maxSkills})`);
  }

  return 'Profile applied: ' + done.join(', ');
}

async function main() {
  let settings;
  try {
    settings = loadSettings();
  } catch (err) {
    console.error('FAILED: ' + err.message);
    process.exitCode = 1;
    return;
  }

  const result = await withNaukri('Naukri profile settings applied', (page) => applyProfile(page, settings));

  const runs = loadRuns();
  recordRun(runs, {
    at: new Date().toISOString(),
    day: 'apply',
    task: 'Apply settings to profile',
    ok: result.ok,
    detail: result.ok ? result.message : result.error,
  });
}

main();
