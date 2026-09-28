# Official Playwright image. The version MUST match "playwright" in package.json.
# It already contains Node.js and the Chromium browser.
FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app

# Install dependencies first (better Docker layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the scripts (the session file is NOT copied - it comes from an env var)
COPY naukri.js human.js settings.js settings.json ./

ENV NODE_ENV=production
ENV HEADLESS=true

# Run once and exit. Render Cron starts this container on schedule.
CMD ["node", "naukri.js"]
