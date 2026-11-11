# Exeter Trailer Hire website

A fast static website (Astro) for hiring the 16ft Brian James car transporter. It includes an availability calendar, a live price estimate and an enquiry form.

## Change the text, prices or contact details

Almost everything is in **`src/config.ts`**: phone, email, WhatsApp, prices, deposit, trailer weights and what's included. Edit it and redeploy, and the whole site updates, including the FAQ, terms and Google search data.

## Run it on your computer

```bash
npm install
npm run dev
```

Then open http://localhost:4321. On your computer the enquiry form pretends to send. It only really sends once the site is on Netlify.

## Put it live on Cloudflare Pages (free; recommended, your domain is already on Cloudflare)

1. **Form key:** go to https://web3forms.com, enter `thesmallcardoc@gmail.com` and you'll be emailed an access key.
   Enquiries from the website will arrive at that address.
2. **Create the site:** Cloudflare dashboard → **Workers & Pages → Create → Pages**.
   - *With GitHub (best):* **Connect to Git**, pick the repo, then set
     Framework preset **Astro**, Build command `npm run build`, Build output directory `dist`
     (and Root directory `site` if the repo contains the whole project folder).
     Every change pushed to GitHub then goes live automatically.
   - *Without GitHub:* **Upload assets**. Run `npm run build` here first, then upload the `dist` folder.
     (For this route, put the keys below in a `.env` file before building.)
3. **Settings → Variables and Secrets** (GitHub route): add
   `PUBLIC_WEB3FORMS_KEY` = your Web3Forms key, `NODE_VERSION` = `22`,
   and optionally `PUBLIC_GCAL_ID` / `PUBLIC_GCAL_KEY` for the availability calendar. Then **Retry deployment**.
4. **Custom domains → Set up a custom domain** → `exetertrailerhire.co.uk`. Because the domain is on Cloudflare,
   it sets up the DNS and HTTPS certificate for you. Add `www.exetertrailerhire.co.uk` too, then create a
   **Redirect Rule** (Rules → Redirect Rules → "Redirect from WWW to root") so www goes to the main address.
5. Test: send an enquiry from the live site and check it reaches your inbox.

## Alternative: Netlify

Leave `PUBLIC_WEB3FORMS_KEY` empty on Netlify and the form uses Netlify Forms instead.

### Put it live on Netlify (free)

1. Put this `site` folder in a GitHub repository, then in Netlify choose **Add new site → Import from Git**. The settings come from `netlify.toml`.
2. **Domain:** Site settings → Domain management → add `exetertrailerhire.co.uk`, then update your domain's DNS as Netlify shows you. Netlify adds HTTPS automatically. `www.` redirects to the main domain.
3. **Enquiry emails:** after the first deploy, go to **Forms → enquiry → Form notifications** and add an email notification to `thesmallcardoc@gmail.com`. The free plan includes 100 submissions a month. Spam is filtered with a honeypot field.

## Availability calendar (Google Calendar)

Booked days are greyed out using a Google Calendar you control from your phone.

1. Create a new Google Calendar called "Trailer bookings". Add each hire as an **all-day event** across the hire dates.
2. In that calendar's settings, tick **Make available to public** and pick **See only free/busy (hide details)**. The site only reads dates. It never shows event names.
3. Copy the **Calendar ID** (Settings → Integrate calendar).
4. In Google Cloud Console, create a project, enable the **Google Calendar API**, and create an **API key**. Under key restrictions choose **Websites** and add `https://exetertrailerhire.co.uk/*`, then restrict the API to Google Calendar API.
5. In Netlify → Site settings → Environment variables, add `PUBLIC_GCAL_ID` (the calendar ID) and `PUBLIC_GCAL_KEY` (the API key), then redeploy.

If these aren't set, the calendar still works for picking dates. It just says you'll confirm availability by reply.

## Google reviews (automatic, free)

The reviews section pulls your latest Google reviews automatically through a small Netlify function
(`netlify/functions/google-reviews.mjs`). It's cached for 24 hours, so Google is asked about once a day,
which keeps it well inside Google's free monthly allowance. Google only ever provides up to **5 reviews** (the ones it
picks as most relevant) plus your overall rating and review count. The section stays hidden until this is set up.

1. Go to https://console.cloud.google.com, sign in, and create a project (e.g. "Exeter Trailer Hire").
2. **Billing:** Google requires a billing account with a card before it issues a key. At this usage it stays free.
   To be safe, go to **Billing → Budgets & alerts** and create a £1 budget with email alerts.
3. **APIs & Services → Library**: search for **Places API (New)** and click **Enable**.
4. **APIs & Services → Credentials → Create credentials → API key**. Click the new key and set:
   - *API restrictions*: **Restrict key → Places API (New)** only.
   - (Application restrictions can stay "None", because the key is only used on Netlify's server, never in the browser.)
5. **Optional hard cap:** **APIs & Services → Places API (New) → Quotas**. Set "Place Details" requests per day to e.g. 50.
6. Find your **Place ID**: https://developers.google.com/maps/documentation/places/web-service/place-id
   Search "Exeter Trailer Hire" on the map and copy the ID (starts with `ChIJ`).
7. In Netlify: **Site configuration → Environment variables → Add variable**:
   - `GOOGLE_PLACES_API_KEY` = your key
   - `GOOGLE_PLACE_ID` = your Place ID
   - optional `GOOGLE_REVIEWS_MIN_RATING` = `4` to only show 4★ and 5★ reviews
8. **Deploys → Trigger deploy**. Check `https://exetertrailerhire.co.uk/api/google-reviews`. It should list your reviews.

Google's terms require the "Reviews from Google" credit and links to the reviewers, which the section already shows.

## Photos

The originals are in the folder above `site`. `npm run photos` rebuilds the web copies in `src/assets/photos/` (see `scripts/prepare-photos.mjs` for which photos are used). Astro makes AVIF/WebP versions in several sizes when the site is built.

## Before launch, check

- [ ] Read **Terms of hire** (`src/pages/hire-terms.astro`) and the **Privacy notice** (`src/pages/privacy.astro`). They are sensible starting drafts, not legal advice.
- [ ] Send a test enquiry on the live site and confirm the email arrives.
- [ ] Add a booking to the Google Calendar and check that the day is crossed out on the site.
- [ ] Register the business on Google Business Profile, linking to the site. That's what gets you on Google Maps.
