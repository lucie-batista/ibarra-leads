#!/usr/bin/env python3
"""Analyze CA ABC "New Applications" CSV downloads for San Francisco leads.

Reads every ABC report CSV in data/ (duplicates and overlapping days
are de-duplicated by license number), keeps San Francisco applications, and
checks each against the SF business registry to tell apart:
  opening-soon  - not in the registry at that address yet
  new-owner     - license transfer (PER), often with escrow
  adding-alcohol- already registered there for a while, new/changed license
Prints aggregate counts plus a per-application table (stays on screen; the
CSVs contain owner names and never go in the repo).
"""
import csv
import glob
import json
import os
import re
import subprocess
import urllib.parse
from collections import Counter

DATA = os.environ.get("IBARRA_DATA") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
REGISTRY = "https://data.sf.gov/resource/g8m3-pdis.json"
SF_COUNTY = "38"
# Retail license types relevant to print customers (eating places, bars, stores, caterers).
FOOD_TYPES = {"20", "21", "40", "41", "42", "47", "48", "57", "58", "59", "61", "75", "77", "86"}
TYPE_NAMES = {"20": "beer & wine store", "21": "liquor store", "40": "beer bar", "41": "restaurant (beer & wine)",
              "42": "wine & beer bar", "47": "restaurant (full bar)", "48": "bar", "57": "special on-sale",
              "58": "caterer", "59": "bar/restaurant (seasonal)", "61": "beer bar", "75": "brewpub", "77": "event",
              "86": "instructional tasting"}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def dba(row):
    m = re.search(r"DBA:\s*(.+?)\s{2,}", row.get("Primary Owner and Premises Addr.", ""))
    return m.group(1).strip() if m else ""


def street_key(addr):
    a = re.sub(r"\b(street|st)\b", "st", (addr or "").lower())
    a = re.sub(r"\b(avenue|ave)\b", "ave", a)
    a = re.sub(r",.*$|\s+(ste|suite|unit|apt|#).*$", "", a)
    return norm(a)


def same_place(a, b):
    na, nb = (re.match(r"\d+", a or "") or [""])[0], (re.match(r"\d+", b or "") or [""])[0]
    wa = re.findall(r"[a-z][a-z0-9]*", (a or "").lower().replace("'", ""))
    wb = re.findall(r"[a-z][a-z0-9]*", (b or "").lower().replace("'", ""))
    return bool(na) and na == nb and bool(wa) and bool(wb) and wa[0] == wb[0]


def similar_name(a, b):
    stop = {"the", "llc", "inc", "restaurant", "cafe", "bar", "and", "san", "francisco", "sf"}
    wa = {w for w in re.findall(r"[a-z0-9]+", (a or "").lower().replace("'", "")) if len(w) > 2 and w not in stop}
    wb = {w for w in re.findall(r"[a-z0-9]+", (b or "").lower().replace("'", "")) if len(w) > 2 and w not in stop}
    return not wb or bool(wa & wb)  # no DBA on the application: any open business at the address counts


def registry_matches(name, addr):
    """Registry records matching the business name, plus records at the same street number + street."""
    num = (re.match(r"\d+", addr or "") or [""])[0]
    # First word of the street name, skipping range suffixes like "-2247"; apostrophes vary ("O'Farrell"/"Ofarrell").
    street = (re.findall(r"[A-Za-z][A-Za-z0-9']*", (addr or "")[len(num):]) or [""])[0].replace("'", "%")
    word = next((w for w in re.findall(r"[A-Za-z']+", name or "") if len(w) > 3 and w.upper() != "THE"), "")
    out = []
    queries = []
    if word:
        queries.append("upper(dba_name) like '%%%s%%'" % word.upper().replace("'", "''"))
    if num and street:
        queries.append("upper(full_business_address) like '%s %s%%'" % (num, street.upper()))
    for where in queries:
        q = urllib.parse.urlencode({"$where": "city='San Francisco' AND " + where,
                                    "$select": "dba_name,full_business_address,location_start_date,location_end_date",
                                    "$limit": 500})
        res = subprocess.run(["curl", "-sS", "--max-time", "30", REGISTRY + "?" + q], capture_output=True)
        try:
            out += json.loads(res.stdout.decode() or "[]")
        except ValueError:
            pass
    return out


def main():
    files = sorted(glob.glob(os.path.join(DATA, "*.csv")))
    apps, seen_rows, file_count = {}, 0, 0
    for f in files:
        with open(f, encoding="utf-8-sig", errors="ignore") as fh:
            rd = csv.DictReader(fh)
            if "License Number" not in (rd.fieldnames or []):
                continue
            file_count += 1
            for r in rd:
                seen_rows += 1
                lic = r["License Number"].strip()
                a = apps.setdefault(lic, {"row": r, "types": set()})
                a["types"].add(r["Type| Dup"].split("|")[0].strip())
    sf = {k: v for k, v in apps.items() if v["row"]["County"].strip() == SF_COUNTY or
          v["row"]["City"].strip().upper() == "SAN FRANCISCO"}
    print("ABC files: %d | rows: %d | distinct applications statewide: %d | San Francisco: %d"
          % (file_count, seen_rows, len(apps), len(sf)))

    kinds, results = Counter(), []
    for lic, a in sf.items():
        r, types = a["row"], a["types"]
        food = bool(types & FOOD_TYPES)
        name, addr = dba(r), r["Prem Street"].strip()
        regs = registry_matches(name, addr) if food else []
        # "Already here" = an open registration at the same street number + street with a similar name
        # (a previous tenant at the address doesn't count).
        here = [x for x in regs if same_place(x.get("full_business_address"), addr)
                and not x.get("location_end_date") and similar_name(x.get("dba_name"), name)]
        if not food:
            kind = "not a print lead"
        elif not here:
            kind = "opening-soon"
        elif "PER" in r["Action"]:
            kind = "new-owner"
        else:
            kind = "adding-alcohol"
        kinds[kind] += 1
        started = max((x.get("location_start_date", "")[:10] for x in here), default="")
        results.append((kind, ",".join(sorted(types)), r["Action"], name or "(no DBA)", addr, r["Zip Code"],
                        "Y" if r["Escrow"].strip() else "-", started))

    print("by kind:", dict(kinds))
    for k in ("opening-soon", "new-owner", "adding-alcohol", "not a print lead"):
        for row in sorted(x for x in results if x[0] == k):
            print("  %-15s %-9s %-12s %-32s | %-26s %s | escrow:%s | registered here since: %s" % row)


if __name__ == "__main__":
    main()
