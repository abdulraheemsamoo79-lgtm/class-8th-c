# 📓 Class Notes Hub

Class ke students copy ke pages upload karte hain, baaki sab subject ke andar dekh aur download kar sakte hain.

## Kya kya hai
- Login / Sign up (class code ke saath, sirf class wale account bana sakte hain)
- Subject-wise notes, chapter filter, search, sorting
- Ek saath 30 photos upload (auto compress), zoom, swipe, download, poori list ZIP mein
- Favourites (♥), Homework board, Top Contributors, Mera account
- Report button (galat/blur photo)
- **Admin panel:** students ko Block/Unblock, Admin banao, uploads delete, reports dekhna, class code badalna
- Dark mode, mobile-first design

## Folder
```
index.html        website ka dhancha
css/style.css     design
js/config.js      <- SIRF ISAY BADLNA HAI (Supabase keys, naam, subjects)
js/*.js           baaki code (auth, notes, admin, homework...)
sql/setup.sql     Supabase database setup
vercel.json       Vercel settings
```

## Setup (20 minute)

### 1) Supabase (free)
1. https://supabase.com par account banao, **New project** banao.
2. **SQL Editor > New query** mein `sql/setup.sql` ka poora content paste karke **Run** karo.
3. **Authentication > Sign In / Providers > Email** mein **"Confirm email" OFF** kar do (warna har student ko email verify karna padega).
4. **Project Settings > API** se `Project URL` aur `anon public` key copy karo.

### 2) Keys daalo
`js/config.js` kholo aur `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_NAME`, `SCHOOL` badlo.

### 3) Vercel par hosting (free)
- **Sabse aasan:** https://vercel.com/new par jao, is poore folder ko drag-drop karo (ya GitHub par push karke import karo). Framework: **Other**, Build command khali, Output directory khali. **Deploy** dabao.
- Link mil jayega, wo class ko bhej do.

### 4) Khud ko Admin banao (sirf ek baar)
1. Apni website par **Sign up** karo (class code: `8c2026`, baad mein admin panel se badal lena).
2. Supabase **SQL Editor** mein ye chalao (email apna likho):
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'aapka@email.com');
```
3. Website refresh karo, neeche menu mein **Admin** aa jayega.

## Dhyan rakhne wali baatein
- `anon` key public hoti hai, ye theek hai. Security database ke rules (RLS) se hoti hai jo `setup.sql` mein hain.
- Photos ka link public hota hai (jiske paas link ho wo dekh sakta hai), lekin list sirf login walon ko milti hai.
- Free plan: 1 GB storage. Photos compress hoti hain (~200-300 KB), to hazaaron pages aa jate hain.
- Agar code ya password leak ho to admin panel > Settings se class code badal do.
- Local testing ke liye `index.html` ko seedha double-click mat karo (modules file:// par nahi chalte). VS Code ka Live Server ya Vercel deploy use karo.
