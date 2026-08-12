# Daily Coding Test — Exact Upgrade

This package is based on the uploaded working project and preserves the existing leaderboard, Daily Challenge, profiles, Faculty Analytics, downloads, admin login, tracker, and Supabase configuration.

## Added
- Daily Coding Test home card
- Admin test creation
- Questions, starter Java code, sample I/O, hidden/public cases
- Student register-number start flow
- Server-persisted start/expiry timer
- Java 21 code runner
- Compile errors, runtime errors, stdout, sample judging
- Hidden-case final judging and partial marks
- Auto-submit at timeout
- Copy/paste/cut/right-click/drop blocking inside editor
- Tab-switch/fullscreen-exit violation logging
- Draft code persistence between questions/refresh
- Supabase tables for tests, questions, cases, attempts, submissions, violations

## Step 1 — Supabase
Open Supabase → SQL Editor → New Query.
Run `coding_test_setup.sql` once.

## Step 2 — Code runner
The `code-runner/` folder is a Dockerized Java 21 FastAPI service.

Local test:
```bash
cd code-runner
docker build -t ece-java-runner .
docker run --rm -p 8080:8080 ece-java-runner
```
Then open `/health` on the runner host. It should return `{"ok":true,"jdk":"21"}`.

For production, deploy this Docker service to a container host and use HTTPS.
Do NOT run arbitrary student code inside GitHub Pages, Supabase SQL, or GitHub Actions.

## Step 3 — Frontend config
In `config.js`:
```js
CODE_RUNNER_URL: "https://YOUR-RUNNER-DOMAIN"
```
Keep your existing Supabase URL and publishable key.

## Step 4 — Push frontend
Push the upgraded `index.html`, `style.css`, `script.js`, `config.js` and SQL/runner files to your repository.

## Step 5 — Create a test
Admin Login → Manage Coding Tests → Create Test → + Question → Add Test Cases → Publish.

Use marks on hidden test cases if you want partial scoring.

## Step 6 — Test with ONE student
Verify:
1. Register number recognized
2. Fullscreen requested
3. Timer survives refresh
4. Java compiles
5. Compiler errors display
6. Sample output displays
7. Hidden cases do not reveal expected output
8. Final score is stored
9. Tab/fullscreen violations are logged
10. Timeout auto-submits

## Important security note
The supplied frontend attempt policies are a functional prototype because the current public leaderboard does not have per-student authentication. Before a real high-stakes exam, move attempt/submission creation and hidden-case judging behind authenticated student accounts or a trusted backend/Edge Function. Browser copy/paste blocking is deterrence, not absolute anti-cheat protection.

## Production runner hardening
The runner already uses an unprivileged container user, process timeouts, JVM heap limits and OS resource limits. For a real exam, additionally deploy each execution in stronger ephemeral isolation (for example a dedicated sandbox/microVM), disable outbound network access, use a read-only filesystem where possible, enforce request rate limits, restrict CORS to your site, and place the service behind HTTPS/authentication.
