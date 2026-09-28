You are a senior Node.js and Playwright engineer. Build a complete, ready-to-deploy project that refreshes my Naukri profile once a day and has a web + mobile dashboard to monitor and control it. Give me every file in full, with the file name as a heading, then a simple step-by-step README. Use simple English.

GOAL
Every day, open my Naukri profile using a saved session, make one small harmless edit (toggle a trailing full stop in the Resume Headline, then save). This keeps my profile showing as "recently updated". A dashboard lets me see status, run it manually, and solve captcha/OTP from my phone or laptop.

SCOPE
- Naukri ONLY. No LinkedIn or Indeed (account-ban risk).
- NO captcha bypass, stealth, or fingerprint-spoofing. If a captcha or OTP appears, I solve it myself through the dashboard.

ARCHITECTURE (keep it simple)
- ONE Render Web Service (Docker) running: Express server + dashboard + node-cron scheduler + Playwright job.
- Schedule: daily at 9:00 AM IST (cron "30 3 * * *" UTC), with a random 0-10 minute delay.
- Storage: JSON files in a /data folder (Render persistent disk): runs.json, settings.json, naukri-session.json. Keep only the last 100 runs.
- Tech: Node.js, Express, Playwright (CommonJS), plain HTML/CSS/JS for the dashboard (no build step, no frameworks).

DASHBOARD (one responsive page, works on web and mobile)
Layout:
- Desktop (width above 900px): left sidebar with menu, main area with cards and tables.
- Mobile (width below 900px): top header, single-column cards, bottom navigation bar with 4 tabs. Big tap-friendly buttons (min 44px).
- Support light and dark mode automatically (prefers-color-scheme). Clean, modern, readable design.
Tabs / sections:
1. Overview: 
   - Status card (Healthy / Needs attention / Running) with colored badge.
   - Last run time and result, next scheduled run time (in IST).
   - Session health (Valid / Expired / Unknown) and days since session was uploaded.
   - Success rate for last 30 days, current streak of successful days.
   - Button: "Run now". Button: "Pause / Resume schedule".
   - Simple bar chart (plain SVG or canvas, no libraries) of last 14 days: success / failed.
2. History: table (cards on mobile) of runs: date, time, result, duration, message. Click a run to see its log and screenshot.
3. Verification: shows ONLY when a run is waiting for me. Displays the live screenshot of the Naukri page, a text box to type the OTP or captcha text, and a Submit button. Auto-refresh every 5 seconds. If the captcha is a click/puzzle type that cannot be answered by text, show a message: "Solve this on your laptop, then upload the new session."
4. Settings:
   - Upload naukri-session.json (file upload) to replace the session.
   - Edit the schedule time and turn on/off the daily run.
   - Choose the edit type (toggle full stop in headline).
   - Optional Telegram alerts (TG_TOKEN, TG_CHAT): send a message on failure, on success, and when verification is needed, including the dashboard link.
   - Change dashboard password.
Security:
- Password login using env DASHBOARD_PASSWORD, signed HTTP-only cookie, rate-limit login attempts (5 per 15 minutes), HTTPS only cookie in production.
- Never show or log the session cookies, passwords, or tokens. Escape all output (no XSS).
- API routes: POST /api/login, GET /api/status, POST /api/run, POST /api/pause, GET /api/runs, GET /api/runs/:id, POST /api/verify, POST /api/session, GET/POST /api/settings. All except login require the cookie.

JOB LOGIC (job.js)
1. Load session from /data/naukri-session.json.
2. Warm-up: open naukri.com home, wait 4-7 seconds (random), open /mnjuser/profile.
3. needsHuman check: URL contains "nlogin", or page text contains captcha / otp / "verify you are human".
   - If yes: save a screenshot, set run status "waiting for verification", send optional Telegram alert, and wait up to 5 minutes for my answer from the dashboard. Type the answer in the OTP/captcha field, submit, and continue. If no answer or a puzzle captcha, mark run as failed with a clear message and set session health to "Expired".
   - After success, save the refreshed session back to /data/naukri-session.json.
4. Edit the Resume Headline (toggle trailing full stop), click Save, and confirm success by the success toast or saved text.
5. Only one run at a time (lock). Save result, duration, log lines, and last screenshot to runs.json.
6. Wrap everything in try/catch. On failure: save screenshot + error, alert me, and never crash the server.
7. Keep ALL CSS selectors in ONE config object at the top of the file with comments, because Naukri changes its layout. Tell me how to fix them with: npx playwright codegen https://www.naukri.com

FILES TO CREATE
package.json (pin versions), server.js, job.js, store.js (read/write JSON safely), notify.js (Telegram, optional), public/index.html, public/styles.css, public/app.js, save-session.js (runs on my laptop with headless:false, lets me log in manually, saves naukri-session.json), Dockerfile (official mcr.microsoft.com/playwright image matching the pinned version), render.yaml (web service, persistent disk mounted at /data, env vars DASHBOARD_PASSWORD, COOKIE_SECRET, TG_TOKEN, TG_CHAT with sync:false), .gitignore (naukri-session.json, node_modules, .env, data/), .env.example, README.md.

README MUST INCLUDE
- How to run save-session.js on my laptop and upload the session in the dashboard.
- How to run the whole project locally and test it (npm start, open http://localhost:3000).
- How to push to a PRIVATE GitHub repo (never commit the session file).
- Render deploy step by step: create the web service from the repo, add the disk, set env vars, open the dashboard URL, log in, click "Run now".
- Note that Render web service + disk is a PAID plan, and Chromium needs at least 1 GB RAM (recommend a plan with 1 GB or more).
- How to add the dashboard to my phone home screen (PWA: add manifest.json and a simple icon).
- What to do when the session expires (run save-session.js, upload in Settings).
- Troubleshooting: selectors changed, captcha on every run from Render (then run the same project on my laptop with Task Scheduler / cron instead), dashboard login problems.
- Honest note: this may violate Naukri's terms, use at your own risk, keep to once a day, never share the session file.

RULES
- Complete, working code. No placeholders except the selectors, which I will confirm with codegen.
- Simple English comments. Never hardcode passwords, tokens, or cookies.
- Make the UI work on a 360px wide phone screen and on a 1440px desktop screen.
- After all files, give me a final checklist of 10 steps to go live.