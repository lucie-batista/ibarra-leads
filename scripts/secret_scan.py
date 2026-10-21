#!/usr/bin/env python3
"""Scan the project folder for anything that looks like a secret.

Exit code 0 = clean, 1 = findings (deploy.sh stops). Run: python3 scripts/secret_scan.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", "node_modules"}
# Files that must never live in the project folder at all.
FORBIDDEN_NAMES = {".clasprc.json", ".env", "credentials.json", "client_secret.json", "HANDOFF-PRIVATE.md"}

PATTERNS = [
    ("Anthropic API key", re.compile(r"sk-ant-[A-Za-z0-9_\-]{10,}")),
    ("Google API key", re.compile(r"AIza[0-9A-Za-z_\-]{35}")),
    ("Google OAuth access token", re.compile(r"ya29\.[0-9A-Za-z_\-]{20,}")),
    ("Google OAuth refresh token", re.compile(r"\b1//0[0-9A-Za-z_\-]{20,}")),
    ("OAuth client secret", re.compile(r"GOCSPX-[0-9A-Za-z_\-]{10,}")),
    ("Private key block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("Token/secret JSON field", re.compile(r"\"(refresh_token|access_token|client_secret|id_token)\"\s*:\s*\"[^\"]+\"")),
    ("Password assignment", re.compile(r"(?i)\b(password|passwd|passcode|api[_-]?key|secret)\b\s*[:=]\s*['\"][^'\"\s]{4,}['\"]")),
    ("Generic long secret", re.compile(r"(?i)\b(key|token|secret)\b\s*[:=]\s*['\"][A-Za-z0-9_\-]{32,}['\"]")),
]
# Phone numbers: the shop's public number is allowed; anything else is flagged
# so personal numbers never land in the repo.
PHONE = re.compile(r"\(?\b\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b")
ALLOWED_PHONES = {"4158266700"}

# Lines containing this marker are ignored (use only for documented examples).
ALLOW_MARKER = "secret-scan:allow"


def scan_file(path):
    findings = []
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as fh:
            for lineno, line in enumerate(fh, 1):
                if ALLOW_MARKER in line:
                    continue
                for label, rx in PATTERNS:
                    if rx.search(line):
                        findings.append((lineno, label))
                for m in PHONE.finditer(line):
                    digits = re.sub(r"\D", "", m.group(0))
                    if digits not in ALLOWED_PHONES:
                        findings.append((lineno, "Phone number (not the shop's)"))
    except OSError as e:
        findings.append((0, "Unreadable file: %s" % e))
    return findings


def main():
    problems = 0
    self_path = os.path.abspath(__file__)
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            path = os.path.join(dirpath, name)
            rel = os.path.relpath(path, ROOT)
            if name in FORBIDDEN_NAMES or name.endswith((".pem", ".key", ".p12")):
                print("FORBIDDEN FILE: %s (must live outside the project folder)" % rel)
                problems += 1
                continue
            if os.path.abspath(path) == self_path:
                continue
            for lineno, label in scan_file(path):
                print("%s:%d: %s" % (rel, lineno, label))
                problems += 1
    if problems:
        print("\nSecret scan FAILED: %d finding(s). Fix them before deploying." % problems)
        return 1
    print("Secret scan clean.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
