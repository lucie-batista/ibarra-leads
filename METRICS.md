# Metrics

Only measured numbers. Each entry records date, query/scope, and method.

## Dataset volume
| Date measured | Scope | Records | Notes |
|---|---|---|---|
| 2026-10-15 | location_start_date > 2026-07-17, ZIPs 94110/94103/94114 | 431 (94110: 175, 94103: 139, 94114: 117) | 16 with location_end_date; 429 with lat/lon; ~321 with dba_start_date ≥ 2026-07 |

## Contact discovery hit rates (M2)
**Test set:** ZIP 94110, location_start_date > 2026-07-17, measured 2026-10-15.
- 175 raw records → **157 leads** after dropping closed records, short-term rentals (721199) and real estate (531xxx).
- 28 of the 157 (18%) have an Apt/Unit/# address, so they're likely home-based.
- Script: `scripts/m2_contact_test.py`. Per-lead results are kept outside the repo.

| Method | Website | Phone | Email | Nothing found | Cost | Notes |
|---|---|---|---|---|---|---|
| OpenStreetMap (one Overpass snapshot, name match ≥0.85 within 150 m) | 2 (1%) | 3 (2%) | 0 | 152 (97%) | $0 | 5 matches (3%); all 5 checked by hand and correct |
| Website crawl (homepage + contact page, robots.txt respected) | n/a | n/a | 2 of 2 sites crawled | n/a | $0 | Only as good as the website-finding step in front of it |
| Google Places Text Search (Enterprise), same 53-lead sample, 1 lookup/lead + site crawl | 8 (15%) | 8 (15%) | 5 (9%) via site crawl | 43 (81%) with no name+address match | $0 (inside the free 1,000/month) | 10 (19%) name+address matches. Another 20 (38%) are address-only matches still to review by hand (could be a trade name, the building, or a previous tenant). Overlap with Claude not yet analyzed |
| Claude web search (Haiku 4.5, ≤2 searches/lead) + site crawl; 53-lead sample (every 3rd of the 157) | 8 (15%) | 11 (21%) | 4 (8%): Claude 2, site crawl 4 (overlapping) | 42 (79%) | **$1.83 total, $0.0345/lead** (measured from API usage) | 0 errors. Match accuracy and category breakdown still to verify by hand (pending CSV). The run's own "high confidence" count (40) also counted confident *not found* answers, so it isn't a match rate |

## Outreach funnel
_Not started._

### Claude web search: hand-check of the 53-lead sample (2026-10-15)
- **Leads with any contact found:** 11.
  - 8 are correct, usable matches.
  - 1 is likely a wrong match (a similar but different business name).
  - 2 are a large medical group (correct match, but not a realistic lead).
- **Usable hit rate:** about 8 of 53 (15%). Leads with an email: 4 of 53 (8%).
- **By preliminary category (leads / any contact / email):**
  - Restaurant 8 / 2 / 0
  - Café/Bakery/Food 5 / 0 / 0
  - Salon/Wellness 9 / 1 / 1
  - Trades 6 / 2 / 0
  - Other (all remaining) 25 / 6 / 3
- **By address type:** Apt/Unit addresses 2 of 8 had a contact; other addresses 9 of 45.

### Google Places: hand-check, and comparison with Claude on the same 53 leads (2026-10-15)
- **10 name+address matches:**
  - 6 usable with a contact.
  - 1 correct, but no contact info.
  - 2 are a large medical group (correct, but not a real lead).
  - 1 is listed by Google as permanently closed.
- **20 address-only matches:**
  - 16 are just the street address, with no business attached.
  - 1 is a real match the code missed because of an apostrophe in the name (fix in M3).
  - 3 are food businesses registered at a food-business incubator's kitchen.
- **Leads with a usable contact:**

  | Claude only | Places only | Both | Combined |
  |---|---|---|---|
  | 5 | 4 | 3 | **12 of 53 (23%)** |

- **Leads with an email (either method plus website check):** 7 of 53 (13%).
- **Food businesses (13 in the sample) with a usable contact:** 3 combined (Places alone 3, Claude alone 2).
- **Cost:** Places $0, inside the free tier. Claude $1.83.

## Pipeline runs
| Date | What | Numbers |
|---|---|---|
| 2026-10-15 | First full refresh (2 mi radius, 180 days) | 1,698 fetched → 1,654 leads (44 duplicate registrations merged) |
| 2026-10-15 | First contact catch-up, 17:58–22:45 (several runs) | Logged runs: 249 Places lookups, 66 matched (27%); 34 Claude lookups, 7 found; 32 emails found. Some runs were cut off by the 6-minute limit before logging, so true totals are a bit higher (Usage tab: about 300 Places lookups tonight, 50 Claude) |
| 2026-10-15 | State after the catch-up (app stats strip, 22:50) | 40 leads ready to email (valid email, status New, not closed), out of 1,438 open leads to contact |
| 2026-10-16 | **First unattended daily run** (time trigger, 06:56) | Refresh: 1,707 fetched, **10 new businesses**, 2 newly closed, 1,683 total leads (incl. 19 liquor-license leads). Contacts: **30 Places lookups (daily cap held)**, 12 matched (40%), 4 emails; 0 Claude (October cap reached). About 1 minute, no timeout |
| 2026-10-16 | Liquor-license import (15 ABC daily reports) | 393 applications statewide → 19 SF leads added (1 opening soon, 10 new owner, 8 adding alcohol) |
| 2026-10-15 | Email repair after adding validation | 1 invalid placeholder email found, 0 recoverable (site has a certificate error), cleared |

## Spend to date
| Service | October 2026 | Notes |
|---|---|---|
| Claude API | $3.53 | $1.83 M2 test + $1.70 catch-up. $0.53 over the $3 cap because of a usage-tracking bug (since fixed). About $6.47 of the $10 prepaid credit left |
| Google Places | $0 | 153 lookups, inside the free 1,000/month |

## Pre-opening signal: CA ABC liquor-license applications (2026-10-16)
- **Sample:** 15 daily "New Applications" reports downloaded manually from ABC's Licensing Reports page.
  - 509 rows → 393 distinct applications statewide → **22 in San Francisco** (about 7 per week).
  - Analysis script: `scripts/abc_analyze.py`; CSVs kept outside the repo.
- **19 of the 22 are food/drink retail.** Matched against the SF business registry (same street number + street, similar name, still open):

  | Category | Count |
  |---|---|
  | Opening soon (new business replacing an old one, not in the registry yet) | 1 |
  | New owner, sale in escrow (pre-takeover) | 8 |
  | New owner, no escrow | 2 |
  | Existing business adding/changing alcohol | 8 |

- **Correction:** an earlier quick check misclassified 3 businesses (one as a new location, two as not-yet-open). The registry lookup had been capped at 3 results and ignored apostrophes and address ranges.
- **Takeaway:** liquor applications mostly flag ownership changes before they complete (about 3/week citywide in escrow), rather than brand-new openings (1 in about 3 weeks).
