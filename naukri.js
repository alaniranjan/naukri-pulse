// naukri.js
// Daily job: open my Naukri profile with a saved session, make ONE small change
// (picked by weekday, see SCHEDULE in settings.js), save it, and exit.
//
// Laptop:  npm start                   (today's task, reads .env automatically)
//          npm start -- --task=wed     (run a specific day's task, for testing)
// Render:  node naukri.js              (Docker image, HEADLESS=true)
//
// This script NEVER types your password and NEVER tries to bypass a captcha.
// If Naukri asks for a captcha or OTP, a human (you) must answer it.

'use strict';

const fs = require('fs');
const path = require('path');

// Load .env if it exists (laptop). On Render the env vars come from the dashboard.
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  /* no .env file - that's fine */
}

const { chromium } = require('playwright');
const { sendShot, sendMessage, waitForReply } = require('./human');
const { SCHEDULE, todayKey, sameSkill, loadSettings, loadRuns, recordRun } = require('./settings');

// ============================================================================
// CONFIG - all selectors live here. Naukri changes its layout often.
// If a step fails with "timeout waiting for locator", fix the selector here.
// Find the new selector with:   npx playwright codegen https://www.naukri.com
// (Log in in the codegen window, click the element, copy the selector it shows.)
// A comma "," means "any of these"; ":visible" means "only visible elements".
//
// Layout confirmed Sep 2026: every profile section is
//   <div class="card"><div class="widgetHead"><span class="widgetTitle">Key skills</span>
//   <span class="edit">  (or <span class="add"> when the section is empty)
// ============================================================================
const card = (title) => `.card:has(.widgetTitle:text-is("${title}"))`;

const CONFIG = {
  urls: {
    home: 'https://www.naukri.com/',
    profile: 'https://www.naukri.com/mnjuser/profile',
  },

  sessionFile: path.join(__dirname, 'naukri-session.json'),

  selectors: {
    // --- Resume headline ---
    headlineEditButton: `${card('Resume headline')} .widgetHead .edit, ${card('Resume headline')} .widgetHead .add`,
    headlineTextarea: '#resumeHeadlineTxt',
    headlineSaveButton: 'form[name="resumeHeadlineForm"] button[type="submit"]',

    // --- Profile summary (loads only after scrolling down) ---
    summaryEditButton: `${card('Profile summary')} .widgetHead .edit, ${card('Profile summary')} .widgetHead .add`,
    summaryTextarea: '#profileSummaryTxt',
    summarySaveButton: 'form[name="profileSummaryForm"] button[type="submit"]',

    // --- Key skills ---
    skillsEditButton: `${card('Key skills')} .widgetHead .edit, ${card('Key skills')} .widgetHead .add`,
    skillsInput: '#keySkillSugg', // "Add skills" text box in the edit form
    skillChip: 'form[name="keySkillsForm"] .chipsContainer .chip', // one chip per skill (title = skill name)
    skillChipRemove: 'a.close', // the "x" inside a chip
    skillSuggestion: '#sugDrp_keySkillSugg li .Sbtn', // dropdown suggestions while typing
    skillsSaveButton: '#saveKeySkills',
    skillsShown: `${card('Key skills')} .widgetCont .chip`, // skills shown on the profile page

    // Green message shown after a successful save.
    successToast: 'p.head:text-is("Success"):visible',

    // OTP box(es). Naukri sometimes shows one box, sometimes one box per digit.
    otpInput: 'input[placeholder*="otp" i]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible',

    // Text captcha answer box ("type the characters you see").
    captchaInput: 'input[name*="captcha" i]:visible, input[id*="captcha" i]:visible, input[placeholder*="captcha" i]:visible',

    // Submit / Verify button on the OTP or captcha screen.
    submitButton: 'button[type="submit"]:visible, button:has-text("Verify"):visible, button:has-text("Submit"):visible',

    // Click / image / puzzle captchas. These cannot be answered by a text reply.
    puzzleCaptcha: 'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="arkoselabs"], iframe[src*="turnstile"], iframe[title*="challenge" i]',

    // Password box on the login page. If we see it, the session has expired.
    passwordInput: 'input[type="password"]:visible',
  },

  timeouts: {
    human: 5 * 60 * 1000, // 5 minutes for you to solve captcha / OTP
    navigation: 60 * 1000,
    element: 20 * 1000,
  },
};

const S = CONFIG.selectors;

// The two text fields we edit, described the same way.
const FIELDS = {
  headline: { name: 'Headline', edit: S.headlineEditButton, textarea: S.headlineTextarea, save: S.headlineSaveButton, max: 250 },
  summary: { name: 'Summary', edit: S.summaryEditButton, textarea: S.summaryTextarea, save: S.summarySaveButton, max: 1000 },
};

// Error that we already reported on Telegram (so we don't report it twice).
class ReportedError extends Error {}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

// Wait a random time between min and max milliseconds (normal human pacing).
function pause(page, minMs, maxMs) {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return page.waitForTimeout(ms);
}

async function isVisible(page, selector) {
  return page.locator(selector).first().isVisible().catch(() => false);
}

// "Java developer" <-> "Java developer."
function toggleStop(text) {
  const trimmed = text.trimEnd();
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed + '.';
}

function short(text, n = 60) {
  const t = text.trim();
  return t.length > n ? t.slice(0, n) + '...' : t;
}

// Default: headless on Render (Render sets RENDER=true), visible window on laptop.
// You can always override with HEADLESS=true / HEADLESS=false.
function readHeadless() {
  const value = (process.env.HEADLESS || '').trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return Boolean(process.env.RENDER);
}

// If NAUKRI_SESSION_B64 is set, decode it into naukri-session.json.
// Otherwise use the naukri-session.json file that save-session.js created.
function prepareSession() {
  const b64 = (process.env.NAUKRI_SESSION_B64 || '').replace(/\s+/g, '');
  if (b64) {
    const json = Buffer.from(b64, 'base64').toString('utf8');
    try {
      JSON.parse(json);
    } catch {
      throw new Error('NAUKRI_SESSION_B64 is not valid base64 of naukri-session.json. Convert the file again.');
    }
    fs.writeFileSync(CONFIG.sessionFile, json);
    console.log('Session loaded from NAUKRI_SESSION_B64.');
    return;
  }
  if (!fs.existsSync(CONFIG.sessionFile)) {
    throw new Error('No session found. Run "npm run save-session" on your laptop first.');
  }
  console.log('Session loaded from naukri-session.json.');
}

// Open the profile page and give it time to load the Resume Headline card.
async function openProfile(page) {
  await page.goto(CONFIG.urls.profile, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeouts.navigation });
  await page.locator(S.headlineEditButton).first()
    .waitFor({ state: 'visible', timeout: CONFIG.timeouts.element })
    .catch(() => {}); // not fatal here; needsHuman() decides what happened
}

// Some cards (like Profile summary) only load after you scroll down.
// Scroll until the button appears, then return it.
async function revealButton(page, selector) {
  const button = page.locator(selector).first();
  for (let i = 0; i < 20 && !(await button.isVisible().catch(() => false)); i++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(500);
  }
  await button.waitFor({ state: 'visible', timeout: CONFIG.timeouts.element });
  await button.scrollIntoViewIfNeeded();
  return button;
}

// Does Naukri want a human? (login page, captcha, OTP, "verify you are human")
async function needsHuman(page) {
  const url = page.url();
  if (url.includes('nlogin')) return true;

  // If the profile loaded normally, the page may still mention "OTP" somewhere
  // (for example "verify mobile via OTP"). Don't treat that as a challenge.
  if (url.includes('/mnjuser/') && (await isVisible(page, S.headlineEditButton))) return false;

  const text = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  return /captcha|\botp\b|verify you are human/i.test(text);
}

async function saveSession(context) {
  await context.storageState({ path: CONFIG.sessionFile });
  console.log('Refreshed session saved to naukri-session.json.');
}

// ---------------------------------------------------------------------------
// Human help: laptop version (you solve it in the visible window)
// ---------------------------------------------------------------------------
async function waitForHumanOnLaptop(page, context) {
  console.log('');
  console.log('>>> Naukri needs you: please log in / solve the captcha / enter the OTP');
  console.log('>>> in the browser window. Waiting up to 5 minutes...');
  console.log('');

  const deadline = Date.now() + CONFIG.timeouts.human;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    const url = page.url();

    // You finished logging in and landed on another /mnjuser/ page: go to the profile.
    if (url.includes('/mnjuser/') && !url.includes('/mnjuser/profile')) {
      await openProfile(page);
      continue;
    }

    if (url.includes('/mnjuser/profile') && !(await needsHuman(page))) {
      await saveSession(context);
      console.log('Thanks! Continuing...');
      return;
    }
  }
  throw new Error('Timed out after 5 minutes waiting for you to finish in the browser.');
}

// ---------------------------------------------------------------------------
// Human help: Render version (you answer on Telegram)
// ---------------------------------------------------------------------------
async function giveUpRunOnLaptop(page, reason) {
  await sendShot(page, `${reason}\n\nRun on laptop and update session (npm run save-session, then update NAUKRI_SESSION_B64).`)
    .catch((err) => console.error('Telegram failed: ' + err.message));
  throw new ReportedError(reason);
}

async function solveWithTelegram(page, context) {
  // Session expired: Naukri wants the password. We never type passwords.
  if (page.url().includes('nlogin') && (await isVisible(page, S.passwordInput))) {
    await giveUpRunOnLaptop(page, 'Naukri session expired (login page shown).');
  }

  // Click / image / puzzle captcha: a text reply cannot solve it.
  if (await isVisible(page, S.puzzleCaptcha)) {
    await giveUpRunOnLaptop(page, 'Naukri shows a click/puzzle captcha that cannot be answered by text.');
  }

  const otpBoxes = page.locator(S.otpInput);
  const captchaBox = page.locator(S.captchaInput).first();
  const otpCount = await otpBoxes.count();

  let kind = null;
  if (otpCount > 0) kind = 'OTP';
  else if (await captchaBox.isVisible().catch(() => false)) kind = 'captcha';

  if (!kind) {
    await giveUpRunOnLaptop(page, 'Naukri wants human verification, but no OTP/captcha text box was found.');
  }

  await sendShot(page, `Naukri is asking for the ${kind}. Reply to this bot with the ${kind} text within 5 minutes.`);
  const answer = await waitForReply(CONFIG.timeouts.human);
  console.log(`Got ${kind} reply from Telegram.`);

  if (kind === 'OTP' && otpCount > 1) {
    // One box per digit: type one character into each box.
    const digits = answer.replace(/\s+/g, '').split('');
    for (let i = 0; i < Math.min(otpCount, digits.length); i++) {
      await otpBoxes.nth(i).fill(digits[i]);
    }
  } else if (kind === 'OTP') {
    await otpBoxes.first().fill(answer.replace(/\s+/g, ''));
  } else {
    await captchaBox.fill(answer);
  }

  await pause(page, 800, 1800);
  if (await isVisible(page, S.submitButton)) {
    await page.locator(S.submitButton).first().click();
  } else {
    await page.keyboard.press('Enter');
  }

  // Wait until we are back inside the logged-in area, then open the profile.
  await page.waitForURL(/\/mnjuser\//, { timeout: CONFIG.timeouts.navigation });
  await openProfile(page);

  if (await needsHuman(page)) {
    throw new Error(`Still blocked after entering the ${kind}. Maybe it was wrong or expired.`);
  }

  // Saved inside the container only. For a long-lasting fix, refresh the session on your laptop.
  await saveSession(context);
  await sendMessage(`${kind} accepted, continuing.`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Confirm a save: success toast, or else reload and run a check.
// ---------------------------------------------------------------------------
async function confirmSaved(page, what, checkAfterReload) {
  const toastSeen = await page.locator(S.successToast).first()
    .waitFor({ state: 'visible', timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (toastSeen) {
    console.log(`${what}: success message seen.`);
    return;
  }

  console.log(`${what}: no success message seen, checking the profile instead...`);
  await openProfile(page);
  if (!(await checkAfterReload())) {
    throw new Error(`${what} was not saved (checked after reload).`);
  }
  console.log(`${what}: saved value confirmed.`);
}

// ---------------------------------------------------------------------------
// Text fields: headline and summary
// ---------------------------------------------------------------------------
async function openTextEditor(page, field) {
  const button = await revealButton(page, field.edit);
  await pause(page, 1000, 2500);
  await button.click();
  const textarea = page.locator(field.textarea).first();
  await textarea.waitFor({ state: 'visible', timeout: CONFIG.timeouts.element });
  return textarea;
}

// makeNewValue(oldValue) returns the new text.
// Returns { changed, oldValue, newValue }. changed=false means the text was already the same.
async function writeTextField(page, field, makeNewValue) {
  const textarea = await openTextEditor(page, field);
  const oldValue = await textarea.inputValue();
  const newValue = makeNewValue(oldValue);

  if (!newValue.trim()) throw new Error(`${field.name}: new text is empty.`);
  if (newValue.length > field.max) throw new Error(`${field.name}: new text is longer than ${field.max} characters.`);

  if (newValue.trim() === oldValue.trim()) {
    await openProfile(page); // close the editor without saving
    return { changed: false, oldValue, newValue };
  }

  await textarea.fill(newValue);
  await pause(page, 1000, 2000);
  await page.locator(field.save).first().click();

  await confirmSaved(page, field.name, async () => {
    const check = await openTextEditor(page, field);
    const saved = (await check.inputValue()).trim();
    await openProfile(page);
    return saved === newValue.trim();
  });

  return { changed: true, oldValue, newValue };
}

async function toggleFieldStop(page, field) {
  const r = await writeTextField(page, field, (old) => {
    if (!old.trim()) throw new Error(`Your Naukri ${field.name} is empty. Run "npm run apply-profile" first.`);
    return toggleStop(old);
  });
  return `${field.name} full stop toggled: "...${r.oldValue.trimEnd().slice(-25)}" -> "...${r.newValue.slice(-25)}"`;
}

// Set the headline to one of the variants. If it is already that text,
// toggle the full stop instead so the profile still gets an update today.
async function setHeadline(page, text, label) {
  const r = await writeTextField(page, FIELDS.headline, () => text);
  if (r.changed) return `Headline set to ${label}: "${short(text)}"`;
  const fallback = await toggleFieldStop(page, FIELDS.headline);
  return `Headline was already ${label}, so: ${fallback}`;
}

// ---------------------------------------------------------------------------
// Key skills
// ---------------------------------------------------------------------------
async function openSkillsEditor(page) {
  const button = await revealButton(page, S.skillsEditButton);
  await pause(page, 1000, 2500);
  await button.click();
  await page.locator(S.skillsInput).waitFor({ state: 'visible', timeout: CONFIG.timeouts.element });
}

// Skills currently in the open edit form.
async function readSkills(page) {
  return page.locator(S.skillChip).evaluateAll((els) =>
    els.map((e) => (e.getAttribute('title') || e.textContent).trim()).filter(Boolean)
  );
}

// Skills shown on the profile page (edit form closed).
async function readShownSkills(page) {
  await revealButton(page, S.skillsEditButton);
  return page.locator(S.skillsShown).evaluateAll((els) =>
    els.map((e) => (e.getAttribute('title') || e.textContent).trim()).filter(Boolean)
  );
}

// Type a skill and add it as a chip. Picks the exact dropdown match if there is one,
// otherwise presses Enter to add it as typed.
async function addSkillChip(page, skill) {
  const input = page.locator(S.skillsInput);
  await input.click();
  await input.fill('');
  await input.pressSequentially(skill, { delay: 70 });
  await page.waitForTimeout(1500);

  const options = page.locator(S.skillSuggestion);
  const count = await options.count();
  let picked = false;
  for (let i = 0; i < count; i++) {
    if (sameSkill(await options.nth(i).innerText(), skill)) {
      await options.nth(i).click();
      picked = true;
      break;
    }
  }
  if (!picked) await input.press('Enter');
  await page.waitForTimeout(800);

  if (!(await readSkills(page)).some((s) => sameSkill(s, skill))) {
    // Some versions of the form add a chip on comma instead of Enter.
    await input.press(',');
    await page.waitForTimeout(800);
  }
  if (!(await readSkills(page)).some((s) => sameSkill(s, skill))) {
    throw new Error(`Naukri did not accept the skill "${skill}".`);
  }
}

async function removeSkillChip(page, skill) {
  const chips = page.locator(S.skillChip);
  const count = await chips.count();
  for (let i = 0; i < count; i++) {
    const chip = chips.nth(i);
    const name = (await chip.getAttribute('title')) || (await chip.innerText());
    if (sameSkill(name, skill)) {
      await chip.locator(S.skillChipRemove).click();
      await page.waitForTimeout(800);
      return;
    }
  }
  throw new Error(`Skill "${skill}" not found in the edit form.`);
}

async function saveSkills(page, checkShownSkills) {
  await pause(page, 1000, 2000);
  await page.locator(S.skillsSaveButton).click();
  await confirmSaved(page, 'Key skills', async () => checkShownSkills(await readShownSkills(page)));
}

// Wednesday: add the next skill from the rotating pool.
async function addRotatingSkill(page, settings, state) {
  await openSkillsEditor(page);
  const current = await readSkills(page);

  if (current.length >= settings.maxSkills) {
    await openProfile(page);
    return `Already ${current.length} skills (max ${settings.maxSkills}), no skill added. ` +
      (await toggleFieldStop(page, FIELDS.headline));
  }

  const pool = settings.rotatingSkills;
  let pick = null;
  let pickIndex = 0;
  for (let k = 0; k < pool.length; k++) {
    const i = (state.rotationIndex + k) % pool.length;
    const onProfile = current.some((s) => sameSkill(s, pool[i]));
    const isCore = settings.coreSkills.some((s) => sameSkill(s, pool[i]));
    if (!onProfile && !isCore) {
      pick = pool[i];
      pickIndex = i;
      break;
    }
  }

  if (!pick) {
    await openProfile(page);
    return 'No rotating skill left to add. ' + (await toggleFieldStop(page, FIELDS.headline));
  }

  await addSkillChip(page, pick);
  await saveSkills(page, (shown) => shown.some((s) => sameSkill(s, pick)));

  state.rotationIndex = (pickIndex + 1) % pool.length;
  state.addedSkill = pick;
  return `Skill added: "${pick}"`;
}

// Friday: remove the skill added on Wednesday. Never touches core skills.
async function removeRotatingSkill(page, settings, state) {
  const skill = state.addedSkill;
  if (!skill || settings.coreSkills.some((s) => sameSkill(s, skill))) {
    state.addedSkill = null;
    return 'No Wednesday skill to remove. ' + (await toggleFieldStop(page, FIELDS.headline));
  }

  await openSkillsEditor(page);
  if (!(await readSkills(page)).some((s) => sameSkill(s, skill))) {
    state.addedSkill = null;
    await openProfile(page);
    return `"${skill}" was already gone. ` + (await toggleFieldStop(page, FIELDS.headline));
  }

  await removeSkillChip(page, skill);
  await saveSkills(page, (shown) => !shown.some((s) => sameSkill(s, skill)));
  state.addedSkill = null;
  return `Skill removed: "${skill}"`;
}

// ---------------------------------------------------------------------------
// Run one day's task
// ---------------------------------------------------------------------------
async function runTask(page, dayKey, settings, state) {
  switch (SCHEDULE[dayKey].task) {
    case 'toggleHeadlineStop': return toggleFieldStop(page, FIELDS.headline);
    case 'headlineB': return setHeadline(page, settings.headlines.variantB, 'variant B');
    case 'addSkill': return addRotatingSkill(page, settings, state);
    case 'toggleSummaryStop': return toggleFieldStop(page, FIELDS.summary);
    case 'removeSkill': return removeRotatingSkill(page, settings, state);
    case 'headlineC': return setHeadline(page, settings.headlines.variantC, 'variant C');
    case 'headlineBase': return setHeadline(page, settings.headlines.base, 'the base version');
    default: throw new Error(`Unknown task for "${dayKey}".`);
  }
}

// ---------------------------------------------------------------------------
// Open a logged-in profile page, run fn(page), report the result.
// Used by this file and by apply-profile.js.
// Returns { ok, message, error }.
// ---------------------------------------------------------------------------
async function withNaukri(title, fn) {
  let browser;
  let page;

  try {
    prepareSession();
    const headless = readHeadless();
    console.log(`Starting (headless=${headless}) at ${new Date().toISOString()}`);

    browser = await chromium.launch({ headless });
    const context = await browser.newContext({
      storageState: CONFIG.sessionFile,
      viewport: { width: 1366, height: 768 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
    });
    page = await context.newPage();

    // Warm-up: open the home page first, wait a bit like a normal visit.
    await page.goto(CONFIG.urls.home, { waitUntil: 'domcontentloaded', timeout: CONFIG.timeouts.navigation });
    await pause(page, 4000, 7000);

    await openProfile(page);

    // Naukri's firewall (Akamai) blocks some browsers outright, e.g. headless Chromium.
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
    if (/access denied/i.test(bodyText)) {
      throw new Error('Naukri blocked this browser ("Access Denied"). Headless mode is blocked - run on your laptop with HEADLESS=false.');
    }

    if (await needsHuman(page)) {
      if (headless) {
        await solveWithTelegram(page, context);
      } else {
        await waitForHumanOnLaptop(page, context);
      }
    }

    const message = await fn(page);

    const ist = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(message);
    console.log(`${title} at ${new Date().toISOString()} (${ist} IST)`);
    await sendMessage(`${title} (${ist} IST)\n${message}`).catch((err) =>
      console.error('Telegram failed: ' + err.message)
    );
    return { ok: true, message };
  } catch (err) {
    console.error('FAILED: ' + err.message);
    if (!(err instanceof ReportedError)) {
      const caption = `${title} FAILED:\n${err.message}`;
      const report = page ? sendShot(page, caption) : sendMessage(caption);
      await report.catch((tgErr) => console.error('Telegram failed: ' + tgErr.message));
    }
    process.exitCode = 1;
    return { ok: false, error: err.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// Which day's task to run: --task=wed, or env TASK=wed, or today (IST).
function pickDay() {
  const arg = process.argv.find((a) => a.startsWith('--task='));
  const value = (arg ? arg.split('=')[1] : process.env.TASK || '').trim().toLowerCase().slice(0, 3);
  if (!value) return todayKey();
  if (!SCHEDULE[value]) throw new Error(`Unknown task "${value}". Use mon, tue, wed, thu, fri, sat or sun.`);
  return value;
}

async function main() {
  let day;
  let settings;
  try {
    day = pickDay();
    settings = loadSettings();
  } catch (err) {
    console.error('FAILED: ' + err.message);
    await sendMessage('Naukri refresh FAILED:\n' + err.message).catch(() => {});
    process.exitCode = 1;
    return;
  }

  const runs = loadRuns();
  const state = { ...runs.state };
  console.log(`Task for ${day.toUpperCase()}: ${SCHEDULE[day].label}`);

  const result = await withNaukri('Naukri profile refreshed', (page) => runTask(page, day, settings, state));

  // Only keep the new rotation state if the change really happened.
  if (result.ok) runs.state = state;
  recordRun(runs, {
    at: new Date().toISOString(),
    day,
    task: SCHEDULE[day].label,
    ok: result.ok,
    detail: result.ok ? result.message : result.error,
  });
}

module.exports = { CONFIG, FIELDS, withNaukri, writeTextField, openSkillsEditor, readSkills, addSkillChip, saveSkills };

if (require.main === module) main();
