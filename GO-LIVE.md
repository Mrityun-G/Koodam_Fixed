# GigEzee go-live checklist

The code changes are done. These are the steps that can only be done in
a dashboard or against the live database, so they are not in the repo.
Work down the list; nothing below depends on anything above it except
where it says so.

---

## 1. Close the Supabase REST API  *(do this first)*

Supabase publishes a REST endpoint for every table in `public` and
serves it to anyone with the anon key — which ships inside the app
bundle and the APK. Until this runs, names, emails, phone numbers,
addresses, bookings and KYC rows can be read with a key that is public
by design.

```bash
cd backend
python migrations/002_row_level_security.py --dry-run   # see what it will do
python migrations/002_row_level_security.py
```

It only turns row level security on and revokes the browser roles'
grants — it changes no data and is safe to re-run. The backend connects
as the tables' owner, and an owner bypasses RLS, so the API carries on
working.

Then confirm, in the Supabase dashboard under **Advisors → Security**,
that nothing is still flagged as publicly readable.

## 2. Lock the avatar bucket

Uploads now go through `POST /users/me/avatar`, so the browser needs
read access only.

Supabase dashboard → **SQL Editor** → paste and run
`backend/migrations/002_storage_policies.sql`.

The last statement prints the surviving policies: there should be
exactly one, the readable one.

## 3. Deploy the Firebase rules

The Realtime Database holds live GPS and the safety PIN for every job in
progress, and Storage holds the Aadhaar, PAN and Voter ID scans. If
either is still in test mode, both are open to the whole internet.

```bash
npm install -g firebase-tools   # once
firebase login
firebase deploy --only database,storage
```

Check the result in the Firebase console: **Realtime Database → Rules**
should no longer warn that the database is public.

> Known gap, noted in `firebase/database.rules.json`: a signed-in user
> can still read another user's order if they know its id. Closing it
> needs `customerUid` and `partnerUid` (Firebase uids) written onto each
> order, because the order currently carries Supabase UUIDs that
> `auth.uid` cannot be compared against. Worth doing next.

## 4. Set the backend environment variables

On Render, **Environment** → add anything missing from
`backend/.env.example`. Two that matter:

- `GIGEZEE_ADMIN_EMAILS` — without it every `/admin/*` endpoint returns
  403 to everyone, including you. The local `.env` had this under the
  old `GIGEZEE_` prefix, which `config.py` did not read.
- `ALLOWED_ORIGINS` — the deployed frontend URL, or the browser blocks
  every call.

`config.py` still reads the old `GIGEZEE_*` names as a fallback, so a
stale environment keeps working, but rename them when convenient.

## 5. Set the frontend environment variables

On Vercel, **Settings → Environment Variables** — see `.env.example`.
Optional but recommended:

- `VITE_GA_MEASUREMENT_ID` — turns analytics on. Unset means none load.
- `VITE_APP_VERSION` — set to the commit sha so a crash report names the
  build it came from.
- `VITE_SENTRY_DSN` — only if you want crashes forwarded to Sentry as
  well as to `/client-errors`.

Remember `.env.production` for the APK: it is what the Android build
talks to, and Vercel does not read it.

## 6. Schedule database backups

Supabase's own snapshots are the provider's copy on the provider's
schedule. Add one you control — Render **Cron Job**, daily:

```
cd backend && python scripts/backup_database.py --out /data/backups
```

Attach a disk at `/data` so the files survive a deploy. Check it works
first with `python scripts/backup_database.py --check`, which only reads.

Use `--format sql` if the image has `pg_dump`; that archive is the one
you can actually restore from. **Restore the backup once into a scratch
database.** An untested backup is not a backup.

## 7. Turn on Firebase email templates

Sign-up now sends a verification email and password reset sends a real
one. In the Firebase console → **Authentication → Templates**, set the
sender name and the action URL to your domain, otherwise the emails
arrive branded as a Firebase project and land in spam.

## 8. Before the Play Store build

- `capacitor.config.json` now says `in.koodam.app` — the old value was
  `com.example.app`, which the Play Console rejects. Changing it means
  this is a new app listing, so do it before the first upload, not after.
- The store listing needs a link to a public privacy policy page. The
  in-app one is at Settings → Terms & Privacy Policy; it needs a web URL
  too.
- Data safety form: GigEzee collects name, email, phone, address and
  location; partners also submit identity documents. Account deletion is
  in Settings → Delete Account, which the form asks about.

---

## Still open

Honest list of what is not done:

- **Firebase order-level rules** — see the gap in step 3.
- **The rate limiter is per-process.** Fine on one Render instance; add
  Redis before scaling to more than one worker, or each worker allows
  the full quota on its own. The note is in `backend/app/rate_limit.py`.
- **No automated tests.** Nothing here is covered by a test suite, so
  every change is verified by hand.
- **`GET /services/` and `GET /services/{id}` are public** on purpose —
  the service catalogue loads before sign-in and holds no personal data.
- **The bundle is 1.4 MB** (365 KB gzipped) in one chunk. Not a
  blocker, but a slow first load on a weak connection. Code-splitting
  the map and Razorpay would help most.
