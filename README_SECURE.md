# Secure LeetCode Profile Manager

This upgrade adds a Supabase Auth login and role-based profile management.

## Roles

### Public Viewer
- Login required
- View leaderboard
- Search students
- Download CSV / Excel / PDF
- Cannot add, edit, or delete profiles

### Administrator
- Login required
- View/search/download
- Add Profile
- Edit Profile
- Delete Profile

Supabase Row Level Security (RLS) is the real authorization layer. JavaScript only controls which buttons are visible.

---

## Before uploading this secure frontend

You already completed the main database security setup in Supabase. Confirm that:
- `public.user_roles` exists
- your admin account has role `admin`
- your viewer account has role `public`
- authenticated users can SELECT from `students`
- only admins can INSERT / UPDATE / DELETE

## 1. Keep your real config.js values

This ZIP contains placeholders in `config.js`.

Copy your CURRENT working values into the new `config.js`:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_..."
};
```

Never use the service-role/secret key in browser code.

## 2. Make Add/Edit/Delete trigger cloud refresh

Run the whole file:

`admin_crud_trigger_upgrade.sql`

in Supabase -> SQL Editor -> New query -> Run.

It upgrades your current student trigger so INSERT, UPDATE, and DELETE all call the existing `super-action` Edge Function.

## 3. Test locally

From this folder:

```powershell
python -m http.server 8000
```

Open:

`http://localhost:8000`

### Public test
Log in with your public/viewer Supabase account:
- leaderboard visible
- Add Profile hidden
- no Edit/Delete buttons

### Admin test
Log out and sign in with your admin account:
- Add Profile visible
- Edit/Delete visible
- CRUD requests are authorized by RLS

## 4. Deploy

Replace your repository frontend files with:
- `index.html`
- `style.css`
- `script.js`
- `config.js`

Also add `admin_crud_trigger_upgrade.sql` to your local archive if you want, but it does not need to be served by the website.

Push:

```powershell
git pull --rebase origin main
git add index.html style.css script.js config.js
git commit -m "Add secure admin and public login"
git push origin main
```

Because GitHub Actions may create commits while you work, pulling before pushing helps avoid non-fast-forward errors.

---

## Important security limitation of GitHub Pages

The LOGIN protects the web application UI and Supabase database operations.

However, `LiveData.csv` and `Students.xlsx` are still static files deployed by GitHub Pages. If your repository / Pages deployment is public, someone who already knows the direct file URL may access those generated files without going through the login screen.

For true data confidentiality, move leaderboard statistics into Supabase and fetch them only through authenticated RLS-protected queries instead of publishing `LiveData.csv` publicly.

For your current use case, the critical admin security is still enforced properly:
- public users cannot INSERT
- public users cannot UPDATE
- public users cannot DELETE
- only admins can modify `students`
