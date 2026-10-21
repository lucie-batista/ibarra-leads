#!/usr/bin/env python3
"""M2 contact hit-rate test (free methods).

Reads raw registrations from data/, writes per-lead results back to
data/ (they contain owner names/addresses), and prints ONLY aggregate
numbers for METRICS.md.

Methods:
  osm  - OpenStreetMap (Overpass API): match lead name near its lat/lon, take website/phone/email tags
  site - fetch the found website's homepage + contact page (respecting robots.txt) for email addresses
"""
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.robotparser
from difflib import SequenceMatcher

DATA = os.environ.get("IBARRA_DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
UA = "IbarraLeads/0.1 (contact-discovery test for a local print shop)"
DATASET = "https://data.sf.gov/resource/g8m3-pdis.json"
OVERPASS = "https://overpass-api.de/api/interpreter"


def get(url, timeout=20, data=None):
    # System Python 3.9 ships LibreSSL 2.8 which fails TLS handshakes with some
    # servers, so fetch through curl instead.
    cmd = ["curl", "-sSL", "--fail", "--max-time", str(timeout), "-A", UA, url]
    if data is not None:
        cmd += ["--data-binary", "@-"]
    out = subprocess.run(cmd, input=data, capture_output=True)
    if out.returncode != 0:
        raise IOError("curl failed (%d) for %s" % (out.returncode, url))
    return out.stdout.decode("utf-8", errors="ignore")


def fetch_leads(zip_code, since):
    where = "location_start_date > '%s' AND business_zip = '%s'" % (since, zip_code)
    q = urllib.parse.urlencode({"$where": where, "$limit": 5000, "$order": "location_start_date DESC"})
    return json.loads(get(DATASET + "?" + q))


def is_skip(r):
    """Preliminary filter (final mapping comes in M3)."""
    code = r.get("self_reported_naics_code") or ""
    return bool(r.get("location_end_date")) or code.startswith("721199") or code.startswith("531")


def norm(s):
    s = (s or "").lower()
    s = re.sub(r"\b(llc|inc|corp|co|ltd|the|sf|san francisco|dba)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def meters(lat1, lon1, lat2, lon2):
    R = 6371000
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


def osm_query(s, w, n, e):
    """Named shops/amenities/offices etc. in one tile; retries on server hiccups."""
    q = ('[out:json][timeout:60];nwr["name"][~"^(shop|amenity|craft|office|leisure|healthcare)$"~"."]'
         '(%f,%f,%f,%f);out center tags;' % (s, w, n, e))
    for attempt in range(3):
        try:
            return json.loads(get(OVERPASS, timeout=90, data=urllib.parse.urlencode({"data": q}).encode()))["elements"]
        except Exception:
            time.sleep(10 * (attempt + 1))
    raise IOError("Overpass failed for tile %s" % ((s, w, n, e),))


def osm_places(bbox, tiles=3):
    # The public Overpass endpoint asks automated users not to hammer it, so we
    # reuse a single saved snapshot (data/osm-<zip>.json) when present.
    cached = os.path.join(DATA, "osm-94110.json")
    if os.path.exists(cached):
        els = {(el["type"], el["id"]): el for el in json.load(open(cached))["elements"]}
    else:
        s, w, n, e = bbox
        dlat, dlon = (n - s) / tiles, (e - w) / tiles
        els = {}
        for i in range(tiles):
            for j in range(tiles):
                for el in osm_query(s + i * dlat, w + j * dlon, s + (i + 1) * dlat, w + (j + 1) * dlon):
                    els[(el["type"], el["id"])] = el
                time.sleep(2)
    out = []
    for el in els.values():
        t = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        if lat is None:
            continue
        out.append({
            "name": t.get("name"), "lat": lat, "lon": lon,
            "website": t.get("website") or t.get("contact:website"),
            "phone": t.get("phone") or t.get("contact:phone"),
            "email": t.get("email") or t.get("contact:email"),
        })
    return out


def osm_match(lead, places):
    loc = (lead.get("location") or {}).get("coordinates")
    if not loc:
        return None
    lon, lat = loc
    names = [norm(lead.get("dba_name")), norm(lead.get("ownership_name"))]
    best, best_score = None, 0
    for p in places:
        if meters(lat, lon, p["lat"], p["lon"]) > 150:
            continue
        pn = norm(p["name"])
        score = max(SequenceMatcher(None, n, pn).ratio() for n in names if n) if any(names) else 0
        if score > best_score:
            best, best_score = p, score
    return best if best_score >= 0.85 else None


EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
JUNK = re.compile(r"(example\.|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|@2x|domain\.com|yourname|email\.com)", re.I)


def allowed(url):
    parts = urllib.parse.urlsplit(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        rp.parse(get("%s://%s/robots.txt" % (parts.scheme, parts.netloc), timeout=10).splitlines())
    except Exception:
        return True  # no robots.txt = no restrictions stated
    return rp.can_fetch(UA, url)


def site_emails(website):
    if not website.startswith("http"):
        website = "http://" + website
    found, pages = set(), [website]
    try:
        if not allowed(website):
            return None, "robots-disallow"
        html = get(website, timeout=15)
    except Exception as e:
        return None, "fetch-error"
    found |= {m for m in EMAIL.findall(html) if not JUNK.search(m)}
    # follow one contact-ish link if no email on the homepage
    if not found:
        m = re.search(r'href="([^"]*contact[^"]*)"', html, re.I)
        if m:
            url = urllib.parse.urljoin(website, m.group(1))
            try:
                if allowed(url):
                    found |= {e for e in EMAIL.findall(get(url, timeout=15)) if not JUNK.search(e)}
            except Exception:
                pass
    return sorted(found), "ok"


def main():
    zip_code = sys.argv[1] if len(sys.argv) > 1 else "94110"
    since = sys.argv[2] if len(sys.argv) > 2 else "2026-07-17"
    raw = fetch_leads(zip_code, since)
    seen, leads = set(), []
    for r in raw:
        key = r.get("ttxid") or (norm(r.get("dba_name")), norm(r.get("full_business_address")))
        if key in seen or is_skip(r):
            continue
        seen.add(key)
        leads.append(r)
    print("raw=%d leads_after_filter=%d" % (len(raw), len(leads)))

    coords = [l["location"]["coordinates"] for l in leads if l.get("location")]
    pad = 0.003
    bbox = (min(c[1] for c in coords) - pad, min(c[0] for c in coords) - pad,
            max(c[1] for c in coords) + pad, max(c[0] for c in coords) + pad)
    places = osm_places(bbox)
    print("osm_places_in_area=%d" % len(places))

    results = []
    for l in leads:
        m = osm_match(l, places)
        row = {"ttxid": l.get("ttxid"), "name": l.get("dba_name"), "address": l.get("full_business_address"),
               "naics": l.get("self_reported_naics_code"), "apt": bool(re.search(r"\b(apt|unit|#)\b", (l.get("full_business_address") or "").lower())),
               "osm": bool(m), "website": m and m["website"], "phone": m and m["phone"],
               "email": m and m["email"], "site_emails": None, "site_status": None}
        if m and m["website"]:
            row["site_emails"], row["site_status"] = site_emails(m["website"])
            time.sleep(1)
        results.append(row)

    with open(os.path.join(DATA, "m2-free-%s.json" % zip_code), "w") as fh:
        json.dump(results, fh, indent=1)

    n = len(results)
    pct = lambda k: "%d (%.0f%%)" % (k, 100.0 * k / n if n else 0)
    has_email = sum(1 for r in results if r["email"] or r["site_emails"])
    has_phone = sum(1 for r in results if r["phone"])
    has_site = sum(1 for r in results if r["website"])
    nothing = sum(1 for r in results if not (r["email"] or r["site_emails"] or r["phone"] or r["website"]))
    print("leads=%d osm_matched=%s website=%s phone=%s email=%s nothing=%s apt_addresses=%s" % (
        n, pct(sum(r["osm"] for r in results)), pct(has_site), pct(has_phone), pct(has_email), pct(nothing),
        pct(sum(r["apt"] for r in results))))
    print("site_fetch_status:", {s: sum(1 for r in results if r["site_status"] == s) for s in {r["site_status"] for r in results if r["site_status"]}})


if __name__ == "__main__":
    main()
