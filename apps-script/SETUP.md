# Booking system setup (about 15 minutes, once)

This connects the website to your Google account so that:
- every enquiry emails you **Accept / Decline** buttons,
- **Accept** puts the hire in a "Trailer bookings" Google Calendar and sends the customer the amount due with your **bank-transfer details**,
- **Mark as paid** and **Deposit returned** buttons keep the calendar, a Google Sheet and the customer up to date,
- booked dates are crossed out on the website's calendar automatically.

Everything runs in **thesmallcardoc@gmail.com**. It's free and needs no card.

---

## 1. Create the script
1. On a computer, sign in to Google as **thesmallcardoc@gmail.com** and go to **https://script.google.com**.
2. Click **New project** (top left).
3. Click **Untitled project** at the top and rename it **Exeter Trailer Hire bookings**.
4. You'll see a file called `Code.gs` with a few lines in it. Select all of it (Ctrl + A) and delete it.
5. Open `site/apps-script/Code.gs` from the website folder in Notepad. Select all (Ctrl + A), copy it, and paste it into the empty editor.
6. Click the **💾 Save** icon.

## 2. Set the time zone
1. Click the **⚙️ Project Settings** cog on the left.
2. Under **Time zone**, choose **(GMT+00:00) London** if it isn't already.

## 3. Add your bank details (private to you)
Still in **Project Settings**, scroll down to **Script properties** → **Add script property**, and add these one at a time:

| Property | Value |
|---|---|
| `BANK_ACCOUNT_NAME` | the name on your business account |
| `BANK_SORT_CODE` | e.g. `12-34-56` |
| `BANK_ACCOUNT_NUMBER` | your 8-digit account number |
| `REVIEW_LINK` | *(optional)* your Google "Ask for reviews" link |

Click **Save script properties**. These stay inside your Google account; they are never put on the website or GitHub.

## 4. Run setup once
1. Click **< > Editor** on the left to go back to the code.
2. In the drop-down next to **▷ Run** at the top, choose **setup**, then click **▷ Run**.
3. Google asks for permission: **Review permissions** → choose your account → if you see "Google hasn't verified this app", click **Advanced → Go to Exeter Trailer Hire bookings (unsafe)** → **Allow**.
   (It says "unverified" because it's your own private script, not a public app. It only works inside your account.)
4. At the bottom, the log shows a link to your new **bookings Sheet**, and a **"Trailer bookings"** calendar now appears in Google Calendar.

## 5. Publish it as a web app
1. Click **Deploy** (top right) → **New deployment**.
2. Click the ⚙️ next to "Select type" → **Web app**.
3. Fill in:
   - Description: `Bookings`
   - **Execute as: Me**
   - **Who has access: Anyone** (this lets the website send enquiries to it; every action still needs the secret link from your email)
4. Click **Deploy**, then **Authorize access** if asked (same steps as above).
5. Copy the **Web app URL** (it ends in `/exec`).

## 6. Connect the website
In Cloudflare → **Workers & Pages → exeter-trailer-hire → Settings → Build → Variables and secrets** → **Add**:
- Name: `PUBLIC_BOOKINGS_URL`
- Value: the Web app URL from step 5

Save, then redeploy (or tell Claude and it will trigger a fresh build).

## 7. Test it
1. On your phone, send a test enquiry from the website.
2. You get an email "New hire request…". Tap **✅ Accept** → **Accept booking**.
3. Check: the hire is in your "Trailer bookings" calendar, the dates are crossed out on the website (within 5 minutes), and if you used your own email in the test, you got the payment email with your bank details.
4. Tap **Mark as paid**, then **Mark deposit returned**, to see the rest of the flow, then delete the test row from the Sheet and the test event from the calendar.

---

### Good to know
- **Changing the script later:** paste the new code, Save, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The web address stays the same.
- **Blocking dates yourself** (holidays, servicing): just add an all-day event in the "Trailer bookings" calendar. The website crosses those days out too.
- **Limits:** a free Google account can send about 100 automated emails a day.
- **If the booking system is ever down**, the website automatically falls back to sending the enquiry by email (Web3Forms), so you don't miss anything.
