# Secure Upgrade Included

For the current Admin/Public login version, read **README_SECURE.md** first.

# LeetCode Profile Manager — Full Cloud Version

This version removes the need to manually edit Excel/CSV for adding students.

## What happens after setup

1. A student/faculty member opens the GitHub Pages dashboard.
2. Clicks **+ Add Profile**.
3. Enters Register Number, Student Name, and LeetCode Username.
4. The profile is stored permanently in **Supabase**.
5. It appears immediately on the webpage as **Pending**.
6. GitHub Actions runs the Python tracker approximately every 5 minutes.
7. Python downloads the latest student directory, creates `students.csv` and `Students.xlsx`, checks LeetCode, updates `LiveData.csv`, `History.csv`, and `DailyActivity.csv`, and commits the generated files.
8. GitHub Pages then shows the updated LeetCode statistics.

Your laptop can be OFF after deployment.

---

# ONE-TIME SETUP

## 1. Create a Supabase project

Create a free Supabase project. In the project, open **SQL Editor**, create a new query, paste the complete contents of `supabase_setup.sql`, and click **Run**.

## 2. Get the two browser values

In Supabase project settings/API, copy:
- Project URL
- anon/public key

Open `config.js` and replace:

```js
SUPABASE_URL: "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE",
SUPABASE_ANON_KEY: "PASTE_YOUR_SUPABASE_ANON_KEY_HERE"
```

The anon key is intentionally used in the browser. Row Level Security in `supabase_setup.sql` limits it to SELECT and INSERT only. **Never put the service_role key in `config.js`.**

## 3. Add GitHub Action secrets

In Supabase project settings/API, copy the **service_role** key.

In GitHub repository:

**Settings → Secrets and variables → Actions → New repository secret**

Create these two secrets exactly:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase service_role key

## 4. GitHub workflow permission

GitHub repository:

**Settings → Actions → General → Workflow permissions → Read and write permissions → Save**

## 5. Upload/push this project

From the project folder:

```powershell
git init
git add .
git commit -m "Add web profile manager"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

If the repository is already connected, use:

```powershell
git add .
git commit -m "Add web profile manager"
git pull --rebase origin main
git push origin main
```

## 6. Test GitHub Actions

Open:

**Repository → Actions → Update LeetCode Leaderboard → Run workflow**

Wait for green success.

## 7. Enable GitHub Pages

Open:

**Settings → Pages → Deploy from a branch → main → /(root) → Save**

Open the Pages URL after deployment.

---

# ADDING A STUDENT

Do NOT edit Excel.

On the deployed webpage:

**+ Add Profile → Register Number → Student Name → LeetCode Username → Add User**

The student is saved to Supabase immediately and appears as Pending. The next GitHub Action run fetches their LeetCode data and regenerates the Excel/CSV files.

# EXCEL

`Students.xlsx` is generated automatically by Python. The webpage's **Excel** button downloads this generated workbook.

# IMPORTANT SECURITY NOTE

This starter version intentionally allows anyone who can access the public page to add a profile. They cannot edit or delete records through the public API. For a college-wide production deployment, add authenticated admin-only profile management before sharing the Add Profile capability broadly.

# LOCAL TEST

Install dependencies:

```powershell
pip install -r requirements.txt
```

Without Supabase environment variables, `tracker.py` falls back to local `students.csv` for testing:

```powershell
python tracker.py
python -m http.server 8000
```

Then open `http://localhost:8000`.

The Add Profile form requires `config.js` to contain your real Supabase URL and anon key.
