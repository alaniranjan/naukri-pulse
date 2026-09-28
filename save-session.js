// save-session.js
// Run this on your LAPTOP (it opens a real browser window).
// You log in to Naukri by hand (password, captcha, OTP - all done by you).
// When you reach your Naukri dashboard, the login cookies are saved to naukri-session.json.
//
// Usage:  npm run save-session

'use strict';

const path = require('path');
const { chromium } = require('playwright');

const LOGIN_URL = 'https://www.naukri.com/nlogin/login';
const SESSION_FILE = path.join(__dirname, 'naukri-session.json');
const LOGIN_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    console.log('');
    console.log('A browser window is open.');
    console.log('Please log in to Naukri yourself (solve any captcha / OTP).');
    console.log('You have 3 minutes. The script continues when you reach /mnjuser/ ...');
    console.log('');

    // Wait until Naukri sends you to your logged-in area (e.g. /mnjuser/homepage).
    await page.waitForURL(/\/mnjuser\//, { timeout: LOGIN_TIMEOUT_MS });

    // Give the site a few seconds to finish setting all its cookies.
    await page.waitForTimeout(5000);

    await context.storageState({ path: SESSION_FILE });

    console.log('Session saved to: ' + SESSION_FILE);
    console.log('');
    console.log('Next: convert it to base64 (see README) and put it in NAUKRI_SESSION_B64 on Render.');
    console.log('NEVER commit or share this file - it works like your password.');
  } catch (err) {
    console.error('Could not save the session: ' + err.message);
    console.error('Did you finish logging in within 3 minutes? Run the script again.');
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
