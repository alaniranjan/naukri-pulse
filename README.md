# Naukri Daily Refresh

This tool opens your Naukri profile once a day and makes **one small change**, following a weekly plan (see "Weekly rotation" below). Naukri then shows your profile as "recently updated" to recruiters. A small local **dashboard** lets you edit your headlines, summary and skills and see what changed.

> **Tested 28 Sep 2026: Naukri blocks headless browsers** ("Access Denied"), even from a home connection. Render can only run headless, so the Render steps below will fail with that message. Run the script on your laptop with a scheduler instead (see Troubleshooting). The Render files are kept in case this changes.

- It works with **Naukri only**.
- It logs in with a **saved session** (cookies). It never stores or types your password.
- It never tries to bypass a captcha. If Naukri shows a captcha or OTP, **you** answer it: in the browser window on your laptop, or through Telegram when it runs on Render.

## Files

| File | What it does |
|---|---|
| `package.json` | Project info. Pins Playwright to version 1.63.0 |
| `save-session.js` | Runs on your laptop. You log in by hand and it saves `naukri-session.json` |
| `naukri.js` | The daily script. Picks one task by weekday. All CSS selectors are in `CONFIG` at the top |
| `settings.json` | Your headlines (base, B, C), summary, core skills, rotating skills, max skills |
| `settings.js` | Reads/checks `settings.json` and `runs.json`; holds the weekly `SCHEDULE` |
| `apply-profile.js` | Copies the base headline, summary and core skills to Naukri |
| `dashboard.js` + `dashboard.html` | Local web dashboard (Today, Settings, History tabs) |
| `runs.json` | Created by the script: run history and rotation state (git-ignored) |
| `human.js` | Telegram helper that sends you screenshots and waits for your reply |
| `Dockerfile` | Builds the image from `mcr.microsoft.com/playwright:v1.63.0-noble` |
| `render.yaml` | Render Cron Job that runs daily at 03:30 UTC (09:00 AM IST) |
| `.env.example` | Template for your local `.env` |
| `.gitignore` / `.dockerignore` | Keep secrets out of Git and Docker |

---

## 1. Install and save your session (on your laptop)

You need **Node.js 20.12 or newer**. Check with `node -v`.

```bash
npm install            # install Playwright
npm run setup          # download the Chromium browser (one time)
npm run save-session   # opens a browser window
```

1. A Chrome window opens on the Naukri login page.
2. Log in yourself. Enter your password and solve any captcha or OTP.
3. When you reach your Naukri dashboard (the URL contains `/mnjuser/`), the script saves `naukri-session.json` and closes the window.
4. You have 3 minutes. If you run out of time, run the command again.

> `naukri-session.json` works like your password. Never commit it, email it, or share it.

## 2. Convert the session file to base64

Render cannot read files from your laptop, so you paste the session in as one long line of text.

**Windows (PowerShell)**, copies the text to your clipboard:
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("naukri-session.json")) | Set-Clipboard
```

**Mac**, copies the text to your clipboard:
```bash
base64 -i naukri-session.json | tr -d '\n' | pbcopy
```

**Linux**, writes the text to a file (the file is git-ignored):
```bash
base64 -w 0 naukri-session.json > session.b64
cat session.b64        # copy this text; delete the file afterwards
```

The text you copied is the value for `NAUKRI_SESSION_B64`.

## 3. Create a Telegram bot and find your chat ID

1. Open Telegram, search for **@BotFather**, and start a chat.
2. Send `/newbot`, then choose a name and a username that ends in `bot`.
3. BotFather replies with a **token** like `123456789:AAH...`. This is `TG_TOKEN`. Keep it secret.
4. Open your new bot in Telegram and send it any message, such as `hi`.
5. Open this URL in your browser (use your own token):
   `https://api.telegram.org/bot<TG_TOKEN>/getUpdates`
6. Find `"chat":{"id":123456789,...`. That number is `TG_CHAT`.

The script accepts replies **only** from this chat ID, so other people cannot control your bot.

> If `getUpdates` shows nothing, send the bot another message and reload the page. If the bot has a webhook set, `getUpdates` does not work. Remove it by opening `https://api.telegram.org/bot<TG_TOKEN>/deleteWebhook`.

## 4. Push to a PRIVATE GitHub repo

1. On GitHub, click **New repository** and select **Private**. Do not add a README.
2. In this folder, run:

```bash
git init
git add .
git status          # CHECK: naukri-session.json, .env, and *.b64 must NOT be listed
git commit -m "Naukri daily refresh"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

If you ever commit the session file by mistake, log out of Naukri on all devices (this makes the old cookies useless), run `save-session` again, and delete the repo.

## 5. Deploy on Render

> Render Cron Jobs are a **paid** service. The cost is small, but check https://render.com/pricing first.

### Option A: Blueprint (recommended)

1. Log in to https://dashboard.render.com and connect your GitHub account.
2. Click **New → Blueprint** and select your private repo.
3. Render reads `render.yaml` and asks for the values marked `sync: false`:
   - `NAUKRI_SESSION_B64`: the base64 text from step 2
   - `TG_TOKEN`: the bot token
   - `TG_CHAT`: your chat ID
4. Click **Apply**. Render builds the Docker image.
5. Open the new cron job **naukri-daily-refresh** and click **Trigger Run** to test it now.
6. Open **Logs**. You should see `Naukri profile refreshed`, and Telegram should send you the same message.

### Option B: create the Cron Job by hand

1. Click **New → Cron Job** and select your repo.
2. Set **Language / Runtime** to **Docker**.
3. Set **Schedule** to `30 3 * * *`. Render uses UTC, so this is 9:00 AM IST.
4. Pick the Singapore region, which is the closest to India.
5. Under **Environment Variables**, add `NAUKRI_SESSION_B64`, `TG_TOKEN`, `TG_CHAT`, and `HEADLESS=true`.
6. Click **Create Cron Job**, then **Trigger Run** to test it.

## 6. Test locally

```bash
cp .env.example .env      # optional. Windows: copy .env.example .env
# edit .env: fill TG_TOKEN and TG_CHAT; keep HEADLESS=false; leave NAUKRI_SESSION_B64 empty
npm start                 # runs today's task
npm start -- --task=thu   # runs a specific day's task (mon ... sun)
```

The scripts read `.env` automatically if it exists. Without Telegram values, messages just print in the terminal.

You will see the browser open Naukri, make today's change, and save. If Naukri shows a captcha or OTP, solve it in the window within 5 minutes. The script then saves a fresh `naukri-session.json`.

To test the exact Render setup with Docker:

```bash
docker build -t naukri-refresh .
docker run --rm --env-file .env -e HEADLESS=true naukri-refresh
```

(For this test, put the base64 text into `NAUKRI_SESSION_B64` in `.env`, because the image does not contain the session file.)

## 7. Weekly rotation, settings and dashboard

Each day the script makes **one** change (weekday in India time):

| Day | Change |
|---|---|
| Mon | Toggle a trailing full stop in the headline |
| Tue | Swap headline to variant B |
| Wed | Add the next skill from the rotating pool (total stays at or below `maxSkills`) |
| Thu | Toggle a trailing full stop in the summary |
| Fri | Remove the skill added on Wednesday |
| Sat | Swap headline to variant C |
| Sun | Return the headline to the base version |

Rules:
- Core skills are never removed. The script also never removes skills you added yourself; Friday only removes the skill it added on Wednesday.
- If a day's change would change nothing (for example, the headline is already variant B), it toggles the headline full stop instead, so the profile still updates.
- `runs.json` remembers the next rotating skill and the skill added on Wednesday. If you delete it, the rotation starts again from the first skill.

**Put your content on Naukri** (first time, or after you change the headline, summary or core skills):
```bash
npm run apply-profile
```

**Dashboard:**
```bash
npm run dashboard         # then open http://localhost:3100 (change with DASHBOARD_PORT in .env)
```
- **Account bar (top):** shows if you are logged in. **Log in** / **Switch account** opens a browser window where you sign in to Naukri (same as `npm run save-session`). **Log out** deletes the saved login from this computer. Both reset the skill rotation, so a new account starts fresh.
- **Today:** the weekly plan, the next skill to add, and buttons to run today's task, a chosen day's task, or "Push settings to profile" (same as `apply-profile`). The log appears live.
- **Settings:** edit the three headlines, summary, core skills, rotating skills and max skills. It checks lengths (headline 250, summary 1000, at least 5 words per headline) before saving to `settings.json`.
- **History:** every run with its result.

The dashboard only listens on your own computer (127.0.0.1). It does not need to be running for the daily schedule to work.

## 8. When the session expires

After some days or weeks, Naukri logs the session out. You will get a Telegram message such as "Naukri session expired … Run on laptop and update session". Then:

1. On your laptop, run `npm run save-session` and log in again.
2. Convert the file to base64 again (step 2).
3. On Render, open the cron job, go to **Environment**, edit `NAUKRI_SESSION_B64`, paste the new value, and save.
4. Click **Trigger Run** to confirm it works.

## 9. Troubleshooting

**"Timeout … waiting for locator" / a selector changed**
Naukri changed its page. Find the new selector:
```bash
npx playwright codegen https://www.naukri.com
```
Log in inside the codegen window, open your profile, and click the Resume Headline pencil, the text box, and Save. Codegen shows a selector for each click. Copy it into the matching line of `CONFIG.selectors` at the top of `naukri.js`. Test with `npm start -- --task=mon` (or the day that failed), then push to GitHub. Render rebuilds automatically.

**Captcha every time on Render**
Naukri may distrust server (data-centre) IP addresses and headless browsers. This project does not hide or fake anything, on purpose. Run it from your laptop instead:

- **Windows Task Scheduler:** Create Basic Task → Daily at 9:00 AM → Action "Start a program":
  - Program: `cmd.exe`
  - Arguments: `/c cd /d C:\path\to\this\folder && npm start >> refresh.log 2>&1`
- **Mac / Linux cron:** run `crontab -e` and add:
  ```
  0 9 * * * cd /path/to/this/folder && /usr/local/bin/npm start >> refresh.log 2>&1
  ```
  Find your npm path with `which npm`. If no screen is available (for example, a server), set `HEADLESS=true` in `.env`. Captcha and OTP requests then come to you on Telegram.

The laptop must be on and awake at that time.

**Telegram messages don't arrive**
Check `TG_TOKEN` and `TG_CHAT`, make sure you pressed **Start** in the bot chat, and make sure no webhook is set (see step 3).

**"Resume Headline is empty"**
Write a headline on your Naukri profile first. The script only toggles the final full stop.

**Render cron is paid**
Cron Jobs are not free on Render. If you don't want to pay, use the laptop scheduler above.

## 10. Honest note

- Automating your account **may violate Naukri's Terms of Service**. Naukri could log you out, ask for more verification, or restrict your account. **Use at your own risk.**
- Run it **once a day at most**. Do not increase the schedule.
- **Never share** `naukri-session.json` or the `NAUKRI_SESSION_B64` value. Anyone who has them can use your Naukri account.
- This project does not bypass captchas, hide the browser, or fake fingerprints. If Naukri asks for a human, a human must answer.
