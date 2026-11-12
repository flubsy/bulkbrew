# Accounts, sync, and the Android app

BulkBrew works with no accounts at all: data lives in the browser. Turning accounts on adds sign-in, and every device you sign in on gets the same collection, decks, reference decks and wishlist.

**Cost:** free.
- **Supabase** free tier: 50,000 monthly users, a 500 MB database. BulkBrew uses roughly 1–4 MB per heavy user.
- **Google and Discord sign-in:** free.
- **Apple sign-in:** needs the paid Apple Developer Program, $99/year. See the iOS section below.

## How it works

- The app still reads and writes the local browser database first, so it's fast and works offline.
- When you're signed in, changes upload a few seconds after you make them. Other devices download them when you open or refocus the tab, and every 2 minutes.
- Everything goes in one table, `user_data`, with Row Level Security. The database itself refuses to show anyone rows that aren't theirs, even though the app's public key is in the browser.
- **First sign-in on a device:** whatever was already there gets added to your account. If the device last synced with a *different* account, you're asked whether to merge or replace.

Code: `src/lib/db.ts` (change tracking), `src/lib/sync.ts` (push/pull), `src/components/sync-provider.tsx`, `src/components/account-panel.tsx`, `supabase/schema.sql`.

## Setup (about 20 minutes)

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com), sign up (GitHub sign-in is fine), then create a **New project**. Pick a region near you and save the database password somewhere safe.
2. When it's ready, open **Project Settings → API keys**. Copy:
   - **Project URL**, e.g. `https://abcdxyz.supabase.co`
   - the **anon / publishable** key. This one is safe in the browser. Never use the `service_role` / secret key in BulkBrew.
3. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.

### 2. Tell Supabase where the app lives

**Authentication → URL Configuration:**
- **Site URL:** your Vercel address, e.g. `https://bulkbrew.vercel.app`
- **Redirect URLs** (add each):
  - `https://bulkbrew.vercel.app/account`
  - `http://localhost:3000/account`
  - `https://*-flubsy.vercel.app/**`. This covers Vercel preview links. Check the exact pattern in a preview URL on your Vercel dashboard.

### 3. Turn on sign-in methods

Callback URL for every provider below: `https://<your-project-ref>.supabase.co/auth/v1/callback`. It's shown on each provider's page in Supabase.

**Email link** is on by default. Supabase's built-in mailer only sends a few emails an hour. That's fine for you and some friends; for more, plug in a free SMTP service like Resend under Authentication → Emails.

**Google:**
1. [console.cloud.google.com](https://console.cloud.google.com): create a project called "BulkBrew".
2. **Google Auth Platform → Branding** (OAuth consent screen): set the app name to BulkBrew and add your support email. Audience: **External**. Add yourself as a test user while testing, then **Publish app** so anyone can sign in. For basic profile and email scopes, Google doesn't require a review.
3. **Clients → Create client → Web application.** Under Authorized redirect URIs, add the Supabase callback URL above.
4. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Sign In / Providers → Google**, and enable it.

**Discord** is popular with Magic players and optional:
1. [discord.com/developers/applications](https://discord.com/developers/applications): **New Application**, called "BulkBrew".
2. **OAuth2:** add the Supabase callback URL as a redirect. Copy the Client ID and Client Secret.
3. Supabase → Providers → **Discord**: paste them and enable it.

**Apple:** see the iOS section. Skip it for now.

### 4. Give the app the keys

In Vercel → your project → **Settings → Environment Variables**, add these for all environments:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon / publishable key |
| `NEXT_PUBLIC_AUTH_PROVIDERS` | `google,discord,email`, listing only the ones you enabled |
| `BULKBREW_DISABLE_AI` | `1`, so AI never runs on the public site |

Then **Deployments → ⋯ → Redeploy**. Do the same in `.env.local` for local development.

A **Sign in** button appears in the header. Tell your friend to download a backup first (Collection → Download everything). Signing in uploads what's in their browser, so nothing is lost either way.

(`DECKBIT_DISABLE_AI` from before the rename still works.)

### 5. Shared deck links

The **share** button on a deck makes a public link, `/d/<id>`. Links live in a `shared_decks` table that's only reachable through two database functions, so nobody can list other people's shares. To switch it on, run all of `supabase/schema.sql` again in the SQL Editor. It's safe to re-run. Sharing works whether or not the person is signed in. If they're signed in, sharing the same deck again updates the same link.

## Renaming the project (Deckbit → BulkBrew)

The code and GitHub repo are already called BulkBrew. The browser database is still called `deckbit` on purpose: renaming it would hide everyone's saved collection. To finish the rename:

1. **Vercel:** Project → **Settings → General → Project Name** → `bulkbrew`. Then **Settings → Domains**: add `bulkbrew.vercel.app`. Keep `deckbit.vercel.app` too, set to redirect to the new one, so old links and installed home-screen apps keep working.
2. **Supabase:** **Project Settings → General → Project name** → BulkBrew. This is cosmetic: the project URL and keys don't change. Then **Authentication → URL Configuration**: set **Site URL** to `https://bulkbrew.vercel.app` and add `https://bulkbrew.vercel.app/account` to **Redirect URLs**. Keep the old deckbit entries until you've removed the old domain. Without this step, sign-in on the new domain redirects back to the old one.
3. **Google sign-in:** nothing to change. Google redirects to Supabase's callback URL, which stays the same. Optionally rename the app on the OAuth consent screen.
4. **Vercel env:** optionally rename `DECKBIT_DISABLE_AI` to `BULKBREW_DISABLE_AI`. Both names work.

## Android app

The plan that needs no rewrite is a **Trusted Web Activity** (TWA): a real Play Store app that runs the BulkBrew website full-screen, with no browser bar. Updates ship automatically whenever Vercel deploys. Sign-in works because it runs in Chrome under the hood.

1. The site is already an installable web app (manifest, icons, standalone display). On Android Chrome you can test it today: open the site, then use ⋮ → **Add to Home screen**.
2. Go to [pwabuilder.com](https://www.pwabuilder.com), enter the Vercel URL, then choose **Package for stores → Android**. Keep the generated signing key safe; you need it for every update.
3. PWABuilder gives you an `assetlinks.json`. Put it at `public/.well-known/assetlinks.json` and redeploy. This proves you own the site, which is what removes the browser bar.
4. Create a [Google Play Console](https://play.google.com/console) account: a one-off $25 fee and an identity check. Upload the `.aab`, fill in the store listing, and use **Internal testing** to send it to friends first.

If you later want native features such as camera card scanning, offline-first sync on the device, or push notifications, the next step is wrapping the same Next.js app with **Capacitor**.

## iOS (later)

- Apple charges $99/year for the Developer Program, which you need both for the App Store and for Sign in with Apple.
- **App Store rule 4.8:** if an app offers Google or Discord sign-in, it must also offer Sign in with Apple. Set Apple up at the same time as the iOS app, not before.
- **Steps:** create an App ID and a Services ID with Sign in with Apple, generate a key, and paste the details into Supabase → Providers → Apple. Then package with PWABuilder's iOS option or Capacitor.
