# 📓 Class Notes Hub

Students upload photos of their notebook pages, and everyone else can view and download them, organised by subject.

## Features
- Login / Sign up protected by a class code (only your class can create accounts)
- Subject-wise notes, chapter filter, search, sorting
- Upload up to 30 photos at once (auto-compressed), zoom, swipe, download, or download a whole list as a ZIP
- Favourites (♥), Homework board, Top Contributors, My account
- Report button for blurry or wrong photos
- **Admin panel:** block / unblock students, make admins, delete uploads, review reports, change the class code
- Dark mode, mobile-first design

## Folder
```
index.html        page skeleton
css/style.css     design
js/config.js      <- THE ONLY FILE YOU EDIT (Supabase keys, name, subjects)
js/*.js           the rest of the code (auth, notes, admin, homework...)
sql/setup.sql     Supabase database setup
vercel.json       Vercel settings
```

## Setup (about 20 minutes)

### 1) Supabase (free)
1. Create an account at https://supabase.com and make a **New project**.
2. Open **SQL Editor > New query**, paste the whole of `sql/setup.sql` and click **Run**.
3. Go to **Authentication > Sign In / Providers > Email** and turn **"Confirm email" OFF** (otherwise every student must verify their email).
4. Go to **Project Settings > API** and copy the `Project URL` and the `anon public` key.

### 2) Add your keys
Open `js/config.js` and set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_NAME` and `SCHOOL`.

### 3) Host on Vercel (free)
- Easiest: go to https://vercel.com/new and drag-drop this whole folder (or push it to GitHub and import it). Framework: **Other**, leave Build Command and Output Directory empty, then click **Deploy**.
- Share the link you get with your class.

### 4) Make yourself Admin (only once)
1. **Sign up** on your website (class code: `8c2026`, you can change it later in the admin panel).
2. In the Supabase **SQL Editor** run this (use your own email):
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'you@email.com');
```
3. Refresh the website. **Admin** now appears in the menu.

## Good to know
- The `anon` key is public by design. Security comes from the database rules (RLS) in `setup.sql`.
- Photo links are public (anyone with the link can open the image), but the list of pages is only available to logged-in students.
- Free plan: 1 GB storage. Photos are compressed to roughly 200-300 KB, so thousands of pages fit.
- If the class code leaks, change it from Admin panel > Settings.
- For local testing don't just double-click `index.html` (ES modules don't run from file://). Use VS Code Live Server or deploy to Vercel.
