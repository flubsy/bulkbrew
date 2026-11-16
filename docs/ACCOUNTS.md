# Accounts, sync, and the Android app

Deckbit works with no accounts at all: data lives in the browser. Turning accounts on adds sign-in, and every device you sign in on gets the same collection, decks, reference decks and wishlist.

**Cost:** free.
- **Supabase** free tier: 50,000 monthly users, a 500 MB database. Deckbit uses roughly 1–4 MB per heavy user.
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
   - the **anon / publishable** key. This one is safe in the browser. Never use the `service_role` / secret key in Deckbit.
3. Open **SQL Editor → New query**, paste all of `supabase/schema.sql`, and click **Run**.

### 2. Tell Supabase where the app lives

**Authentication → URL Configuration:**
- **Site URL:** your Vercel address, e.g. `https://deckbit.vercel.app`
- **Redirect URLs** (add each):
  - `https://deckbit.vercel.app/account`
  - `http://localhost:3000/account`
  - `https://*-flubsy.vercel.app/**`. This covers Vercel preview links. Check the exact pattern in a preview URL on your Vercel dashboard.

### 3. Turn on sign-in methods

Callback URL for every provider below: `https://<your-project-ref>.supabase.co/auth/v1/callback`. It's shown on each provider's page in Supabase.

**Username + password** (the main sign-in). People create an account with a username, an email and a password, then sign in with either the username or the email.
1. **Authentication → Sign In / Providers → Email**: make sure it's enabled, and turn **Confirm email** OFF. Accounts then work straight away with no verification email. If you leave it on, new accounts have to click a link before they can sign in.
2. Set **Minimum password length** to 8 on the same page, to match the app.
3. Run `supabase/schema.sql` again in the SQL Editor (safe to re-run). This adds the usernames table and the sign-in-by-username check.
4. **Forgot password** emails a reset link that opens `/account?reset=1`. That URL is covered by the `/account` redirect URLs in step 2 above. Supabase's built-in mailer only sends a few emails an hour, which is fine for resets among friends; for more, plug in a free SMTP service like Resend under Authentication → Emails. Open the link on the same device and browser that asked for it.

The email sign-in link (magic link) isn't offered in the app any more. Accounts made with it, or with Google/Discord, can pick a username and set a password on the Account page.

Keep `email` in `NEXT_PUBLIC_AUTH_PROVIDERS` (step 4): it shows the username/password form. Google and Discord buttons appear underneath if they're listed too.

**Google:**
1. [console.cloud.google.com](https://console.cloud.google.com): create a project called "Deckbit".
2. **Google Auth Platform → Branding** (OAuth consent screen): set the app name to Deckbit and add your support email. Audience: **External**. Add yourself as a test user while testing, then **Publish app** so anyone can sign in. For basic profile and email scopes, Google doesn't require a review.
3. **Clients → Create client → Web application.** Under Authorized redirect URIs, add the Supabase callback URL above.
4. Copy the **Client ID** and **Client secret** into Supabase → **Authentication → Sign In / Providers → Google**, and enable it.

**Discord** is popular with Magic players and optional:
1. [discord.com/developers/applications](https://discord.com/developers/applications): **New Application**, called "Deckbit".
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
| `DECKBIT_DISABLE_AI` | `1`, so AI never runs on the public site |

Then **Deployments → ⋯ → Redeploy**. Do the same in `.env.local` for local development.

A **Sign in** button appears in the header. Tell your friend to download a backup first (Collection → Download everything). Signing in uploads what's in their browser, so nothing is lost either way.

(`BULKBREW_DISABLE_AI` also works, from when the app was briefly called BulkBrew.)

### 5. Shared deck links

The **share** button on a deck makes a public link, `/d/<id>`. Links live in a `shared_decks` table that's only reachable through two database functions, so nobody can list other people's shares. To switch it on, run all of `supabase/schema.sql` again in the SQL Editor. It's safe to re-run. Sharing works whether or not the person is signed in. If they're signed in, sharing the same deck again updates the same link.

### 6. Admin dashboard (`/admin`)

This page shows site-wide usage:
- Accounts and active users.
- Decks saved per week.
- Most-built commanders, most-played cards and themes.
- Brackets, formats and collection sizes.
- Most-owned and most-wished cards, and share-link views.

It only shows totals and top lists: no emails, names, deck names or anyone's collection. A card or commander is only listed once 2+ different people have it, so no one's deck can be singled out.

To set it up:
1. Run `supabase/schema.sql` again. This adds the `admins` table and the `admin_stats()` function.
2. In the SQL Editor, make your account an admin. Use the email you sign in with; a Google account is fine, no separate admin account needed:
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com';
   ```
3. Sign in. An **Admin dashboard** button appears on the Account page, or go straight to `/admin`.

The page isn't linked anywhere else and is hidden from search engines. Everyone else, signed in or not, just sees "Nothing here", because the database function refuses anyone who isn't in `admins`.

## Android app

The plan that needs no rewrite is a **Trusted Web Activity** (TWA): a real Play Store app that runs the Deckbit website full-screen, with no browser bar. Updates ship automatically whenever Vercel deploys. Sign-in works because it runs in Chrome under the hood.

1. The site is already an installable web app (manifest, icons, standalone display). On Android Chrome you can test it today: open the site, then use ⋮ → **Add to Home screen**.
2. Go to [pwabuilder.com](https://www.pwabuilder.com), enter the Vercel URL, then choose **Package for stores → Android**. Keep the generated signing key safe; you need it for every update.
3. PWABuilder gives you an `assetlinks.json`. Put it at `public/.well-known/assetlinks.json` and redeploy. This proves you own the site, which is what removes the browser bar.
4. Create a [Google Play Console](https://play.google.com/console) account: a one-off $25 fee and an identity check. Upload the `.aab`, fill in the store listing, and use **Internal testing** to send it to friends first.

If you later want native features such as camera card scanning, offline-first sync on the device, or push notifications, the next step is wrapping the same Next.js app with **Capacitor**.

## iOS (later)

- Apple charges $99/year for the Developer Program, which you need both for the App Store and for Sign in with Apple.
- **App Store rule 4.8:** if an app offers Google or Discord sign-in, it must also offer Sign in with Apple. Set Apple up at the same time as the iOS app, not before.
- **Steps:** create an App ID and a Services ID with Sign in with Apple, generate a key, and paste the details into Supabase → Providers → Apple. Then package with PWABuilder's iOS option or Capacitor.
