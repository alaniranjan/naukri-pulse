Below is a full profile you can copy, plus the daily change plan. **Only keep skills you really know.** Recruiters test what is on your profile, and Naukri also shows a skill match score.

## 1. Resume headline (max 250 characters)

Use one of these as your base:

> QA Automation Engineer | Playwright, TypeScript, API Testing, CI/CD | 2 Years Experience | AI-Assisted Testing with Claude

## 2. Profile summary (max 1000 characters)

> QA Automation Engineer with 2 years of experience building and maintaining end-to-end test suites using Playwright and TypeScript/JavaScript. Skilled in Page Object Model, fixtures, API testing, cross-browser and parallel execution, and handling flaky tests. Experience running automated tests in CI/CD pipelines with GitHub Actions. I use AI tools such as Claude to generate test cases, speed up framework development, and analyze failed test logs, while reviewing and understanding all code. Comfortable with Git, bug reporting, and working in Agile teams. Looking for SDET / QA Automation roles where I can improve test coverage and reduce regression time.

## 3. Key skills (Naukri allows up to 20)

**Core, never remove (12):**
1. Playwright
2. Test Automation
3. QA Automation
4. TypeScript
5. JavaScript
6. API Testing
7. Page Object Model
8. Regression Testing
9. Functional Testing
10. Git
11. CI/CD
12. GitHub Actions

**Rotating pool, add or remove daily (pick only what you know):**
- Postman
- REST API
- Cross Browser Testing
- Parallel Execution
- Test Automation Framework
- Jenkins
- Docker
- Allure Report
- SQL
- Selenium
- Jira
- Agile
- Manual Testing
- Smoke Testing
- Sanity Testing
- Bug Tracking
- AI Testing
- Prompt Engineering
- Claude
- Playwright MCP

## 4. Daily change task (what the script does each day)

Change **only one small thing per day**, following this weekly rotation:

| Day | Task |
|---|---|
| Mon | Toggle a trailing full stop in the headline |
| Tue | Swap headline to variant B (below) |
| Wed | Add one skill from the rotating pool (keep total 20 or fewer) |
| Thu | Toggle a trailing full stop in the summary |
| Fri | Remove the skill added on Wednesday |
| Sat | Swap headline to variant C |
| Sun | Return the headline to the base version |

**Headline variants:**
- **B:** SDET | Playwright Automation Engineer | TypeScript, API Testing, GitHub Actions | 2 Years Experience | AI-Assisted Test Automation
- **C:** Test Automation Engineer | Playwright, JavaScript, Page Object Model, CI/CD | Reducing Regression Time with AI-Assisted Testing

## 5. Config to paste into the project prompt

Add this line to the prompt, replacing the "Edit step" logic:

```
EDIT ROTATION: Read from settings.json. Each day pick ONE task by weekday (Mon: toggle headline full stop; Tue: headline variant B; Wed: add next skill from rotatingSkills; Thu: toggle summary full stop; Fri: remove the skill added Wednesday; Sat: headline variant C; Sun: base headline). Never touch coreSkills. Keep total skills at 20 or fewer. Store the last change in runs.json. All headline texts, summary, coreSkills, and rotatingSkills must be editable in the dashboard Settings tab.
```

## Tips
- Update your **experience, notice period, and current CTC** honestly, since recruiters filter on them.
- Set "Actively looking" and keep the resume PDF current.
- Replace "2 Years" with your real number.

Want me to make the Settings tab fields (headline, summary, skills) part of the main prompt so you can edit them in the dashboard?


Copy this into Notepad. Paste it into Claude (with web search turned on) whenever you want fresh jobs.

```
You are my job search assistant. Search the web for the LATEST jobs (posted in the last 3 days) that match my profile, then give me the results as a downloadable Excel file (.xlsx) with clickable URLs.

MY PROFILE
Role: QA Automation Engineer / SDET
Experience: 2 years
Location: Bengaluru (also Remote, Hyderabad, Pune, Chennai)
Core skills: Playwright, TypeScript, JavaScript, Test Automation, API Testing, Page Object Model, Regression Testing, CI/CD, GitHub Actions, Git
Extra skills: Postman, REST API, Docker, Jenkins, SQL, Allure, Selenium, Jira, Agile, AI Testing, Claude, Prompt Engineering, Playwright MCP

SEARCH KEYWORDS
Titles: Playwright Automation Engineer, QA Automation Engineer, SDET, Software Development Engineer in Test, Test Automation Engineer, Automation Test Engineer, Software Engineer in Test
Skills: Playwright TypeScript, Playwright JavaScript, Playwright API testing, Playwright CI/CD, AI test automation, agentic testing
Exclude: Intern, Trainee, Fresher only, Manual testing only, Lead, Manager, Architect, 8+ years, 10+ years
Experience: 1 to 4 years

WHERE TO SEARCH
Naukri, LinkedIn Jobs, Indeed, Glassdoor, Wellfound, Instahyre, company career pages, Google Jobs. Use only real job links you actually found. Never invent a job or a URL. If a link cannot be confirmed, leave it out.

MATCH SCORE (0-100)
- Title matches my target roles: +30
- Each core skill found: +4 (max 40)
- Each extra skill found: +2 (max 10)
- Experience fits 1-4 years: +10
- Location matches: +10
- Exclude word found: -50
Labels: 80+ Strong match, 60-79 Good match, 40-59 Maybe, below 40 Skip.

EXCEL FILE COLUMNS
Date Found | Posted Date | Job Title | Company | Location | Experience | Salary | Skills Required | Match Score | Match Label | Matched Skills | Missing Skills | Source | Job URL (clickable) | Status (New/Saved/Applied/Interview/Rejected) | Notes

Formatting: header row frozen, filters on, sorted by Match Score (highest first), colored Match Label, Arial font. Add a second sheet "Search Links" with clickable last-24-hours search URLs for each keyword on Naukri, LinkedIn, Indeed, and Google Jobs.

RULES
- Find at least 30 jobs. Remove duplicates (same company + title + location).
- Only jobs posted in the last 3 days.
- After the file, tell me in 5 lines: how many jobs found, how many strong matches, the top 5 jobs with links, and the skills I am missing most often.
- Be honest if you found fewer jobs than requested.
```

**Tips:**
- Run it **every morning** and apply to the strong matches within 24 hours.
- Web search cannot see every job, since LinkedIn and Naukri hide many listings from search engines. That is why the "Search Links" sheet is included, so you can click and check the sites yourself.
- Change "Bengaluru" and the years of experience to your real details.