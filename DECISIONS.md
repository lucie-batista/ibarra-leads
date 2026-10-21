# Decisions

Format: date · decision · options considered · chosen · why.

## 2026-10-15 · Project layout
- **Chosen:** One project folder: Apps Script source in `src/` (pushed with clasp), Node tests in `tests/`, one-off analysis scripts in `scripts/`.
- **Why:** clasp pushes only `src/`, so tests, scripts and docs live alongside the code without ever reaching the deployed project.

## 2026-10-15 · Secrets and raw data stay outside the repo
- **Chosen:**
  - API keys live only in Apps Script Script Properties (entered in the browser).
  - Local secrets go in `~/ibarra-secrets/.env`, and clasp credentials in `~/.clasprc.json`.
  - Raw dataset pulls go in `~/ibarra-data/` (not in the repo; revised 2026-10-16, see below).
- **Why:** Outsiders may see the repo. Many registrations are sole proprietors whose "business address" is their home, listed under their personal name, so the repo gets only aggregate numbers.
- **Enforcement:** `scripts/secret_scan.py` runs before every deploy. It flags key/token patterns, credential files, and any phone number other than the shop's public number.

## 2026-10-15 · Data source
- **Chosen:** SF Registered Business Locations (`g8m3-pdis`) via `https://data.sf.gov/resource/g8m3-pdis.json`.
- **Initial probe (90 days, ZIPs 94110/94103/94114):**
  - 431 records (175 / 139 / 117 by ZIP).
  - 16 have an end date; 429 have lat/lon.
  - The dataset has **no phone, email or website fields**, so contact discovery is a separate problem (see M2).

## 2026-10-15 · Scope and budget
- **Scope:** Build the full scope as specified; the timeline shouldn't shrink it.
- **Budget:** The $100 prepaid card may pay for any service, so Google Places is now an option. It's a single $100 pool shared across all services. Every paid service needs a hard cap and a graceful fallback.

## 2026-10-15 · Shop Google account identity
- **Options:**
  - (A1) Sign up with the existing sales@ Zoho address. One identity, but signup needs codes sent to that inbox (José).
  - (A2) A new Gmail address.
- **Chosen:** A2, a new Gmail address.
- **Why:** José isn't reachable today for verification codes sent to the shop inbox.
- **Follow-up for handoff:** Any phone/recovery details used temporarily during signup must be replaced with José's before handoff. This is on the handoff checklist.

## 2026-10-15 · Node.js install method
- **Options:** (B1) the official nodejs.org tarball in `~/.local/node`, no admin password; (B2) the .pkg installer, which needs the admin password.
- **Chosen:** B1. Node v24.22.0 LTS (SHA-256 verified against nodejs.org SHASUMS256.txt). Added to PATH via `~/.zprofile`.
- **Why:** No sudo, and no npm EACCES problems because the global prefix is user-owned.
- **Related:** clasp 3.4.1 installed globally. Updates go through `clasp update-deployment <id>` (the clasp 3 name for `deploy -i`).

## 2026-10-15 · Shop Google account created
- **Account:** a new Gmail account for the shop (Apps Script API enabled).
- **Birthday:** set to a placeholder date because José's real birthday wasn't available. The date itself is recorded only on the private credentials sheet (`~/ibarra-secrets/`), because Google may ask for it during account recovery. HANDOFF.md must tell José this.
- **Handoff to-do:** replace the temporary verification phone with José's and add a recovery method.

## 2026-10-15 · Apps Script project layout and deployment
- **Project:** The script is **bound** to a new "Ibarra Leads" Google Sheet in the shop's Drive, created via `clasp create-script --type sheets`. The script and its database travel together, and José sees one file.
- **Web app:** runs as the shop account, access "Anyone" (anonymous), protected by a passcode (added in M5).
- **Deployment ID:** Kept in `~/ibarra-secrets/deployment.id`, **not** in the repo, because the ID is the web app URL. `deploy.sh` reads it from there.
- **Pipeline check:** the deployment went from version @1 to @2 with the same ID.
- **What the repo does hold:** the script and Sheet IDs, in `.clasp.json`. They aren't secrets, since access needs the shop account's sharing.

## 2026-10-15 · M1: Keep the Apps Script web app UI
- **Options:** (1) Apps Script HtmlService UI; (2) a static frontend on Cloudflare Pages backed by an Apps Script JSON API.
- **Chosen:** (1). A live spike (10 real registrations as cards) worked well.
- **Why:** One system, no extra account or deploy step, and José's URL is already fixed. The backend (`Api.js`) stays UI-free, so (2) remains possible later.

## 2026-10-15 · M2 finding: OpenStreetMap isn't a viable contact source
- **Result:** It found something for only 3% of 94110 leads, because brand-new businesses usually aren't mapped yet.
- **Policy:** The public Overpass endpoint asks automated users to run their own server, so it can't be used by the daily tool.
- **Status:** Dropped as a method. The one snapshot taken was used only for this measurement.
- **Technical note:** macOS system Python 3.9 uses LibreSSL 2.8, which fails TLS with some servers, so local scripts fetch through `curl`. Apps Script's UrlFetch is unaffected.

## 2026-10-15 · Anthropic Console account and API key
- **Account:** Created with Google sign-in on the shop Gmail, Individual account type, $10 prepaid credit. Auto-reload is off, and the Console monthly spend limit is reportedly $20. That limit can't be reached with only $10 loaded.
- **Key handling:** The key went straight into Apps Script Script Properties (`ANTHROPIC_API_KEY`) and was never stored on the development machine or in chat. So Claude tests run inside Apps Script, not in local scripts.
- **Key expiry options:** (1) never expires; (2) expires after a period such as 1 year.
- **Chosen:** (1) never expires.
- **Why:** The tool must run indefinitely, and an expired key would quietly drop it to plain templates with no one noticing. Exposure is capped by the $10 prepaid credit (no auto-reload) and storage only in Script Properties. The key can be revoked instantly. HANDOFF.md will explain how to replace it.

## 2026-10-15 · M2: Claude web search results and how leads get contacted
- **Measured** (details in METRICS.md): about 15% of leads had a usable contact and 8% had an email, at $0.035 per lead. Brand-new food businesses almost never had a findable email.
- **Decided:** The tool picks each lead's **best available action**, in priority order:
  1. Email, if one is known.
  2. Call, if a phone is known.
  3. Visit, if within 0.5 mi of the shop (setting in the Config tab).
  4. Mail a postcard, as a suggestion showing the mailing address.
  5. Search on Google.
- **Email** is fully supported (draft, mailto, copy). Mail and visit are only suggestions with a short script; the tool doesn't generate letters.
- **Google Places:** test on the same 53-lead sample before choosing a contact-discovery method. Expect better phone and storefront coverage than Claude, and still few emails.
- **Discount codes:** settled in the next entry.

## 2026-10-15 · No discount or attribution codes
- **Options:**
  - (A) One shared code for every channel.
  - (B) No code: new customers just say they're new, or mention the email/postcard.
  - (C) A per-lead IB-#### code (the original spec).
- **Chosen:** (B), no code.
- **Why:** Customers will call, email or walk in, and can simply say they're new to get 15% off the first order. One rule is easier for José and staff than any code.
- **Effects:**
  - Removed from scope: IB codes and lookup by code. Lead lookup becomes a search by business name.
  - Email and mail scripts will say to mention they're a new customer. The offer stays exactly "15% off your first order", with no invented terms.
  - Attribution comes only from the status José records (Emailed/Called/Visited/Mailed → Replied → Customer). Results reporting depends on José keeping statuses up to date.

## 2026-10-15 · Google Cloud billing for Places
- **Card question:** The prepaid card isn't the business's own card. The options were a test project on a personal account, attaching the card to the shop account, or skipping Places.
- **Resolved:** A dedicated, trackable business card was used for this. It's attached to a billing account under the **shop** Google account, linked to the Cloud project "Ibarra Leads", so nothing depends on a personal account.
- **Cost control:** a per-day Text Search quota (100/day for the M2 test day, giving room for reruns, then 30/day ≈ 900/month, under the 1,000 free Enterprise calls per month) plus an optional $1 budget alert.
- **Handoff to-do:** confirm with José whether this card stays on file or gets replaced with his own. Expected charges are $0 as long as the quota holds. Also **upgrade the Cloud free trial to a full account** before the 90-day trial ends, or Places stops. The free tier still applies after upgrading.

## 2026-10-15 · Places quota on the free trial
- **Finding:** Google Cloud free-trial accounts can't edit quotas ("free trial does not permit quota increase"; Edit quota is greyed out).
- **Why that's OK for now:** Trial accounts can't charge the card. Usage draws only on trial credit, and services stop rather than bill. The trial is the hard cap during M2/M3.
- **Plan:**
  1. Build an in-code limit (≤30 Places lookups/day, ≤900/month, tracked in Script Properties) that falls back to Claude / Search on Google.
  2. Before handoff, upgrade to a full account and set SearchTextRequest per day = 30 in the console.
  3. Keep the $1 budget alert.

## 2026-10-15 · Contact-discovery strategy (end of M2)
- **Options:** (A) Places first, then Claude for promising leads; (B) Places only; (C) Claude only.
- **Chosen:** (A), Places first, then Claude. How it works:
  - Every new lead gets one free Places Text Search lookup. This also flags businesses Google already lists as closed.
  - If Places has no name+address match **and** the lead is in a priority category, Claude web search (Haiku 4.5, ≤2 searches) runs too. Capped at 5/day and $3/month.
  - A "Find contact with AI" button covers any lead on demand.
  - Every website found gets checked for emails (robots.txt respected).
- **Why:** On the same 53 leads, the two methods found mostly *different* businesses. Places is better at storefronts and Claude at trades/professionals. Combined: 23% usable contact and 13% email, versus about 15–17% for either alone.
- **Cost:** about $2–3/month. When Claude credit runs out, the tool degrades to Places + Search on Google.
- **Also decided:**
  - Visit-suggestion radius: **2 miles**. A Config-tab setting.
  - Suggestion for José in the handoff doc: contact La Cocina (food-business incubator, 2948 Folsom St). 4 of the 13 sampled food leads were registered at its kitchen.

## 2026-10-15 · Coverage area and lead window
- **Options:** (A) 2-mile radius + 6-month window; (B) ZIP list + 4 neighboring ZIPs; (C) 1-mile radius; (D) all of SF.
- **Chosen:** (A), 2-mile radius around the shop with a 6-month window.
- **Measured:**
  - The original 3 ZIPs covered about 20% of SF's new registrations (415 of 2,064 in 90 days).
  - Within 2 mi: 1,606 registrations in 6 months, about 270/month.
- **Why:** Businesses keep ordering print through their first months. A distance limit is cleaner than ZIP borders and matches the visit radius. Ranking keeps the list manageable.
- **Settings:** Radius, window and an optional ZIP filter are all Config-tab settings.
- **Places lookup caps** (the goal was more than 30 a day at first without exceeding the free tier):
  - A one-time catch-up of up to 300 lookups on the top-ranked priority leads.
  - Then 30/day.
  - A hard monthly stop at 900 (the free tier is 1,000/month).
  - Planned October total: about 830.

## 2026-10-15 · Category mapping and ranking
- **Mapping** (in `src/Classify.js`, previewed on 1,581 real leads within 2 mi / 6 months). A category is decided by, in priority order:
  1. the city license description;
  2. the NAICS prefix (longest match wins);
  3. name keywords, when NAICS is missing or unmapped. This recovered about 100 leads; 26% of records have no NAICS code.
- **Skip:** short-term rentals; real estate; rideshare and delivery drivers; holding companies and trusts; private households; names that are just a street address; and likely solo consultants (consulting/freelance/therapist codes plus a home address or a business named after the owner).
- **Startup/Tech:** kept. When home-based, its weight drops from 12 to 4.
- **"Brand new" label:** becomes "New business or new owner". Ownership changes create new registrations for long-running bars and restaurants, and new owners often redo menus and signs.
- **Ranking:**
  - Revised twice the same day:
    1. First version: email leads always above non-email leads.
    2. Adding time decay turned email into a 45-point bonus.
    3. A nearby restaurant José can call or visit should still beat an 'Other' business with an email.
  - Final: email is a strong but not dominant 30-point bonus.
  - Points (higher ranks higher):
    - category, up to 40 (Restaurant 40, Café 36, Bar 32, Retail 28, Salon 24, Trades 20, Childcare 20, Startup/Tech 12 or 4 if home-based, Other 8);
    - recency, up to 25 (falls linearly to 0 at 180 days);
    - distance, up to 20 (falls to 0 at 2 mi);
    - best contact: email 30, phone 8, website 5;
    - home-based −10.
  - Effect, for week-old leads 1 mi away unless noted. Higher score ranks higher:

    | Score | Lead |
    |---|---|
    | 92 | Retail with email |
    | 88 | Salon with email |
    | 84 | Trades with email |
    | 82 | Restaurant with phone |
    | 81 | Restaurant, 0.3 mi, no contact (visit) |
    | 74 | Restaurant, no contact |
    | 72 | Other with email |
    | 56 | Other with email, 4 months old |
  - Leads José has contacted leave the default 'New' list.
  - All weights are Config-tab settings.

## 2026-10-15 · Email template direction (M4)
- **Structure:** a shared frame plus a category-specific subject and middle paragraph. Kept in a Templates tab so José can edit wording without code.
- **Approved:**
  - Restaurant template tone, with an added "small local businesses support each other" message.
  - Signature "José Maria Ibarra".
  - "Hablamos español." line at the bottom.
  - Offer worded "15% off your first order — just mention you're a new customer" (no code, no expiry or other terms).
  - Footer has the shop's physical address, phone, email and an opt-out line.
- **AI personalization:** an on-demand button only (Haiku 4.5, about $0.002/draft estimated from about 600 input + 300 output tokens; cached per lead). **Deferred:** built behind a feature flag, off for now.
- **Pending confirmation with José:**
  - the "about 40 years" claim;
  - the "come see samples" line;
  - the product list in each category paragraph. Anything he doesn't offer gets removed, so emails only claim what's true.

## 2026-10-15 · Draft editing and opt-outs
- **Templates:** All category templates and the call/visit script approved. José should still confirm the product list and the "about 40 years" / samples claims before real sends; that's on the handoff checklist.
- **Edit button:** José can edit subject and body before opening his email app. Edits are saved to the lead in the Sheet.
- **Do-Not-Contact:**
  - Options: (1) a separate Do-Not-Contact list; (2) statuses on each lead.
  - Chosen: (2), no separate list. Statuses: New → Contacted (emailed/called/visited/mailed) → Replied → Quoted → Customer, or **No thanks**.
  - "No thanks" leads are hidden from the default list and their Email button is disabled. This keeps the opt-out promise made in every email.

## 2026-10-15 · Incident: first catch-up run timed out, and usage caps didn't work
- **What happened:**
  - The first `setup` run loaded 1,654 leads.
  - The contact step then exceeded the 6-minute execution limit, because a slow website fetch ran past the time budget.
  - Checking the live Usage tab exposed a worse bug. Sheets converted the date text "2026-10-15" into a Date, so usage was never matched to "today" or "this month". Caps were enforced only within a single run.
- **Impact:**
  - Claude spend for October reached **$3.53**, $0.53 over the $3 monthly cap.
  - Places reached 153 lookups, inside the free tier, so $0.
  - No data was lost; each lookup was saved as it happened.
- **Fixes:**
  - Dates are normalized on read, and today's row is written as text.
  - Old rows are merged to one per day.
  - The continuation trigger is scheduled *before* work starts.
  - Catch-up counters are saved after every lookup.
  - Leads are marked "in-progress" so a slow one can't stall later runs; they reset after 24h.
  - The time budget dropped from 4.5 to 3.5 min.
  - The local test harness now emulates Sheets' date conversion. A test replays the real post-bug Usage state and expects exactly 200 Places / 0 Claude lookups.
- **Config reconciled by hand:** places_catchup_remaining = 200 (100 of 300 used); claude_catchup_remaining = 0. No more automatic Claude lookups in October because the cap is reached; they resume Nov 1.

## 2026-10-15 · Backlog pace: keep the planned catch-up
- **Options:**
  - (A) Use the rest of October's free Places lookups tonight (about 950 total).
  - (B) Clear the whole 1,385-lead backlog now, about $23 over the free tier, charged to Google trial credit.
  - (C) Keep the plan: 353 today, then 30/day.
- **Chosen:** (C).
- **Why:** Good data early without risking budgets. Tonight's lookups cover the best-ranked leads, and the backlog clears in about 6–7 weeks at 30/day, still inside the free tier.
- **Note:** None of the options touched Claude credit. Claude is capped at $3/month and is already at the cap for October.

## 2026-10-15 · M4+M5 built: drafts, web app UI, passcode
- **Passcode:**
  - Only a salted SHA-256 hash is stored in Script Properties. To set or change the passcode, add a `PASSCODE_NEW` property in the browser; the next page load hashes it and deletes the plain text.
  - Sessions are random tokens in CacheService (6 hours).
  - Every data and save call checks the session server-side. 10 wrong attempts lock login for 15 minutes.
- **Edits can't be overwritten:** The pipeline writes only system columns and the UI writes only José's columns. A short document lock covers the re-sort and UI saves, so an edit can't land on a moved row. Tested: an edit survives a full refresh plus re-sort.
- **Email sending:**
  - "Open in email" builds a mailto link. Above about 1,900 characters it opens with the subject only and copies the body to the clipboard.
  - Also available: "Copy email" and an "Open Zoho Mail" link.
  - Zoho Mail API sending stays a possible future upgrade, not built. It would allow one-click send, but needs OAuth to José's Zoho account and token upkeep, and auto-send isn't wanted.
- **Data load:** one call; filtering and sorting happen client-side. Skip leads aren't sent to the UI.

## 2026-10-15 · Fixes from the first UI test
- **"Open in email" blocked by the browser:** It was opened via `window.open` from inside the Apps Script iframe, which some browsers block as a pop-up. Now it's a plain `<a href="mailto:…" target="_top">` link, allowed on user click.
- **To: "[email protected]":**
  - Cause: some sites hide addresses with Cloudflare email obfuscation, and Claude returned the placeholder text.
  - Now: the crawler decodes Cloudflare-protected addresses; every email (Claude, crawl, manual) must pass validation; the UI never shows an invalid one.
  - Bad addresses already saved are repaired on the next run: the site is re-read for free, or the address is cleared.
- **Save felt unresponsive:** Buttons now show "Saving…", ignore repeat clicks, and re-enable on error. The server-side row lookup uses TextFinder instead of scanning all IDs.

## M7 hardening backlog (collected so far)
- **Top priority:** Continuation runs sometimes exceed 6 minutes and die before logging, leaving gaps (e.g. 18:24 → 22:42 on 2026-10-15). Fixes: log a start row per run, skip website crawls when time is short, and surface failures visibly.
- Flag leads whose website failed to load or had a certificate error ("Website didn't load when we checked"). Example: a caterer lead whose site shows "connection not private".
- Registrations without a street number (e.g. "Miss N Mission St"): Places can't match them, and distance relies only on dataset coordinates. Consider flagging them.
- Pending from earlier: upgrade the Google Cloud trial before it ends; lower the console quota to 30/day once quota editing is allowed; José to confirm template claims and product list.

## 2026-10-15 · Misc confirmations
- **Tooling:** VS Code's built-in AI/Copilot features are off; Claude Code is the only AI assistant used.
- **Handoff:** José does the account to-dos himself. HANDOFF.md gets an "Owner to-do" checklist: recovery phone, Google Cloud trial upgrade + quota, confirming template claims and products, optionally removing or replacing the card.
- **UI:** Leads older than the lookback window should leave "To contact" unless José has started working them (added to M7).

## 2026-10-15 · M7 batch 1 (reliability) deployed
- **Run logging:** every run writes a "started" row, so a run that dies shows up as a start with no finish.
- **Time-aware website checks:** No website fetch starts with less than 75 s left in the run; a slow site can no longer push a run past 6 minutes.
- **Website status:** a new system column, `website_status` (ok / unreachable / robots-disallow / skipped). The UI flags "Didn't load when we checked".
  - Existing Leads tabs are migrated by inserting the column in place. Tested: José's columns stay aligned, and the migration is idempotent.
- **Aged-out leads:** Leads older than the lookback window with status New drop out of "To contact" and the counts.
- **Stale data:** If the last successful refresh is over 36 h old, the app shows a warning instead of silently showing old data.

## 2026-10-15 · In-app template editor
- **What:** A Templates page in the web app edits every template (email body, per-category subject + paragraph, call/visit script, mail note). It has Save, Reset to original, and a live preview using a real lead of that category.
- **Behavior:** Saved templates apply to all leads. A lead with a hand-edited, saved draft keeps it, so template changes never overwrite José's per-lead work.
- **Guards:** The email body must keep `{category_paragraph}` (enforced server-side). The UI warns, but doesn't block, if `{business_name}` is removed. The key is whitelisted, text is capped at 5,000 chars, and the session is checked.

## 2026-10-15 · No script for visits
- **Change:** Removed the "what to say" script from the Visit option (José doesn't need coaching for in-person visits). Visit shows the address, distance, Directions and Mark visited.
- **Call:** keeps its short, editable script.

## 2026-10-16 · UI redesign
- **Problems found in a design review** of local renders at desktop and phone sizes:
  - Too many equal-weight chips per card.
  - Brick red overused (category tags looked like warnings).
  - An internal score shown on cards.
  - A passive action label that looked like a button.
  - Seven stat boxes plus four dropdowns hid the main workflow.
  - A heavy black header; small text for an older user; a cryptic ★.
  - A 13-pill template picker; cards overflowing on phones.
- **Changes:**
  - (A) A row of views with counts (To email default · To call · Visit or mail · All new · In progress · Customers · No thanks) plus search/category/sort.
  - (B) Simplified cards with relative "Opened N days ago" and only meaningful tags; score moved to detail fine print.
  - (C) A real color-coded action button per card.
  - (D) Color roles: brick red only for primary actions and brand; green email, blue call, amber visit/mail.
  - (E) A white header with an IB mark.
  - (F) 16px base text and ≥44px targets.
  - (G) Lead detail as a sticky-header sheet; email as Review → Send → Mark as emailed.
  - (H) Templates with a "Part to edit" dropdown and side-by-side live preview.
  - Results funnel bars.
- **Also fixed:**
  - Dates normalized server-side (Sheets Date → yyyy-mm-dd) for the "opened" text.
  - Explicit `<meta charset="utf-8">`.
  - A grid min-width overflow on phones.
- **Tooling:** `tests/preview/` builds a local, mocked copy of the UI with real leads, written to `data/preview` (gitignored, with a sample-data banner). Playwright screenshots support design review.

## 2026-10-16 · Button color roles revised
- **Problem:** Red Save / Open in email buttons confusing, because red reads as danger.
- **Now:**
  - Ordinary primary buttons (Save, Unlock, Save changes) are **charcoal**.
  - Contact buttons use their method color: Open in email green, Call blue, Directions/Copy address amber.
  - The selected status is charcoal, Customer green, No thanks red.
  - Brick red is used only for the IB mark and "No thanks".

## 2026-10-16 · No counts on the view tabs
- **Change:** Tabs show only the action (To email, To call, Visit or mail, All new, In progress, Customers).
- **Why:** Counts were computed live and accurate, but they added clutter and invited nitpicking in demos without helping José choose what to do.
- **What's left:** a small "N businesses" line above the list. Results keeps the funnel numbers.

## 2026-10-16 · Research: catching businesses before they open
Measured on 2026-10-16, within 2 mi of the shop unless noted.
- **Business registry (g8m3-pdis):** 0 future-dated registrations within 2 mi (1 citywide). SF requires registration within 15 days of starting business, so it's an at-opening signal.
- **CA ABC liquor license applications:** the best pre-opening signal for restaurants and bars (30-day posted notice). There's no open data feed (data.ca.gov has only COVID-era ABC datasets), and abc.ca.gov blocks automated access, so it's **not automated**, per the no-scraping rule. Manual tip for José: watch for the window notice.
- **DPH health inspections (tvy3-wexg):** pre-opening inspection types (Plan Check, New Ownership, Structural) haven't appeared since mid-2025, so this source isn't usable.
- **Building permits (i98e-djp9):** about 35 in 90 days mention restaurant/cafe/retail/tenant improvement/change of use. Noisy (gates, coolers at existing restaurants), address-only.
- **Planning Dept. projects (qvu5-m3a2):** 54 citywide in 6 months mention restaurant/change of use/formula retail/tenant work; 19 in nearby ZIPs, about a third real new openings.
- **Conclusion:** A "Coming soon" tab from building permits + planning projects, keyword-filtered, would yield roughly 3–8 real upcoming openings a month as address-based Visit leads, at $0. Whether to build it is still open.

## 2026-10-16 · Liquor-license applications as pre-opening leads
- **Source:** CA ABC "Licensing Reports → New Applications". This is ABC's official, published download. It's downloaded manually in a browser; the tool doesn't fetch it, and ABC's site isn't scraped or circumvented.
- **Sample:** 6 daily reports, 146 applications statewide, **8 in SF (about 9–10/week citywide)**: 7 restaurants/cafés and 1 wholesale.
  - Checked against the city registry:
    - 1 is a **new location not yet open** (the registry has the business only at other addresses);
    - 2 are **new owners mid-sale** (escrow; registered at that address in the last 4 months);
    - 4 are **existing businesses adding or changing alcohol** (a drink-menu opportunity).
  - Each record has a DBA name, premises address, owner mailing address, license type, action (ORI = new license, PER = transfer) and escrow.
- **Decided:** These pre-opening leads are **citywide (all SF)**, not limited to 2 mi, because their expected return is higher. Distance still affects ranking.
- **Policy note:**
  - Relaxing the "respect blocked sites" rule was considered and rejected: circumventing technical blocks carries terms/legal risk and is fragile.
  - Resolution: ABC itself publishes these reports for download, so a person downloads them and the tool imports the file. Nothing is circumvented.

## 2026-10-16 · "Coming soon" (liquor licenses + permits) deferred
- **Decision:** Not building it now.
- **For later:** Findings are in METRICS.md ("Pre-opening signal"). `scripts/abc_analyze.py` holds the matching logic for a future import from ABC's published New Applications reports.

## 2026-10-16 · "Liquor licenses" tab built (deferral reversed)
- **Why:** On review, all 19 SF applications in the 3-week sample were worth contacting. A new owner means a new pitch, and adding alcohol means a drink-menu pitch.
- **Name:** "Liquor licenses" (not "Coming soon", which would mislead for existing businesses). Each lead is tagged Opening soon / New owner / Adding alcohol.
- **Data flow:**
  1. A person downloads ABC's published New Applications CSVs and drops them in the shop Drive folder "ABC reports".
  2. The daily run (or `importLicensesNow`) imports unseen files (tracked by file ID).
  3. It keeps SF food/drink retail license types citywide and de-duplicates by license number.
  4. It tags each lead via a live registry lookup (same rules as `scripts/abc_analyze.py`) and geocodes the address with Apps Script's Maps service.
- **Storage:** leads with `lead_id` = `ABC-<license>` and `source` = abc. Registry refreshes never merge into them.
- **Visibility:** they appear only in the Liquor licenses tab (plus In progress / Customers once worked).
- **Emails:** the opener adapts ("your upcoming opening at" / "taking over at" / "your new liquor license at"). New templates `subject_/paragraph_New owner` and `subject_/paragraph_Adding alcohol` are editable on the Templates page.
- **Permissions:** adds `drive.readonly` (read-only; cannot modify Drive).
- **Tested:** importing the 15 real files yields 19 leads (1/10/8, matching the analysis). Re-import adds 0. A refresh after import keeps the license leads intact.

## 2026-10-16 · "Mail" renamed "Postcard" in the UI
- **Why:** "Mail" next to "Email" was confusing.
- **Change:** The physical-mail action shows as **Postcard** everywhere José sees it (button, the "Visit or postcard" tab, "Mark postcard sent", the Results breakdown).
- **Stored value:** `contacted_via` stays "Mail" internally, so existing data and the API are unchanged.
- **Best-action order is unchanged:** Email → Call → Visit (≤ visit radius, 2 mi) → Postcard (if a mailing address exists) → Look up.

## 2026-10-16 · Restaurant email: free menu price updates
- **Added:** "And when your prices change, there's no charge for updating your menu. You only pay for the printing."
- **Basis:** José's policy: no charge for menu price changes, only printing costs. Added to the claims José should confirm (with "about 40 years", samples, and the product list).
- **Live Sheet update:** the new default reaches the existing Templates tab via `TEMPLATE_UPGRADES`, which replaces a template only if it still equals the exact previous default, so hand edits are never overwritten (tested).
- **Scope:** Restaurant paragraph only for now. It could also fit Café/Bar/New owner/Adding alcohol (all menu-heavy) later.

## 2026-10-16 · UI refers to the shop, not José
- **Why:** Anyone at the business may use the tool.
- **Changes:**
  - The Templates subtitle now reads "The starting wording for Ibarra Brothers' emails".
  - The postcard note now reads "Send the Ibarra Brothers new-customer postcard to this address" (the live Sheet is upgraded via `TEMPLATE_UPGRADES`; hand edits are kept).
- **Not changed (pending):** the email signature "José Maria Ibarra" and the call script "I'm José Maria…", which name José as the sender.

## 2026-10-16 · Sender identity in templates
- **Options:** (A) keep "José Maria Ibarra"; (B) "José Maria Ibarra & the Ibarra Brothers team"; (C) a fill-in sender name.
- **Chosen:** (B). Personal, but accurate whoever at the shop sends it.
- **Call script:** now opens "Hi, I'm calling from Ibarra Brothers Printing on Valencia St…".
- **Rollout:** Both reach the live Sheet via `TEMPLATE_UPGRADES`; hand edits are kept.

## 2026-10-16 · Web app URL stays out of the repo
- **Why:** The deployed app holds the shop's real leads and runs on its paid API keys. The deployment ID (which is the URL) lives in `~/ibarra-secrets/deployment.id`.
- **Protection:** The passcode is the access control: every data call and save is checked server-side, with a 15-minute lockout after 10 wrong tries. José can rotate the passcode at any time (HANDOFF §8).

## 2026-10-16 · Raw public data included in the repo
- **What changed:** The raw public downloads (SF business registrations and CA ABC license reports) now live in `data/` in the repo, so the analysis and tests can be reproduced. This revises the 2026-10-15 "raw data stays outside the repo" rule for those files only.
- **Contents:** public records, including registrants' names and some home/mailing addresses.
- **Still excluded:** contact-lookup results (Places, Claude and website-crawl output, the OpenStreetMap snapshot) contain phone numbers and emails found for specific people, so `.gitignore` keeps them out. Secrets stay outside the folder as before. Scripts read `data/` by default, or the folder in `IBARRA_DATA`.
