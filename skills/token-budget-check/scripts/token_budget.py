#!/usr/bin/env python3
"""Estimate token usage of files/text and compare to a context budget.

Same heuristic as the TokGuess VS Code extension. Standard library only.
"""
import argparse
import json
import math
import os
import re
import sys

CHARS_PER_TOKEN = 4.2
CODE_BOOST = 1.08
PUNCT = re.compile(r"[.,!?;:\-()\[\]{}]")
CODE_PATTERNS = [
    re.compile(r"\{[\s\S]*\}"),
    re.compile(r"function|const|let|var|import|export|class|def |async "),
    re.compile(r"=>|::|//"),
    re.compile(r"\.[\w]+\("),
]
SKIP_DIRS = {".git", "node_modules", "dist", "build", "out", "__pycache__", ".venv", "venv", ".next", "target"}
SKIP_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Cargo.lock", "composer.lock"}
SKIP_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar", ".woff", ".woff2",
            ".ttf", ".mp3", ".mp4", ".mov", ".so", ".dll", ".exe", ".pyc", ".map", ".min.js"}


def estimate_tokens(text):
    cleaned = text.strip()
    if not cleaned:
        return 0
    est = math.ceil(len(cleaned) / CHARS_PER_TOKEN)
    est += math.ceil(len(PUNCT.findall(cleaned)) * 0.4)
    if any(p.search(cleaned) for p in CODE_PATTERNS):
        est = math.ceil(est * CODE_BOOST)
    return max(est, 1)


def iter_files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, dirs, files in os.walk(p):
                dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
                for f in sorted(files):
                    if f in SKIP_FILES or f.lower().endswith(tuple(SKIP_EXT)):
                        continue
                    yield os.path.join(root, f)
        else:
            yield p


def read_text(path):
    try:
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError as e:
        return None, str(e)
    if b"\x00" in data[:4096]:
        return None, "binary"
    return data.decode("utf-8", errors="replace"), None


def main():
    ap = argparse.ArgumentParser(description="Estimate tokens and check a context budget.")
    ap.add_argument("paths", nargs="+", help="files, directories, or - for stdin")
    ap.add_argument("--threshold", type=int, default=32000)
    ap.add_argument("--warn-percent", type=int, default=75)
    ap.add_argument("--top", type=int, default=5, help="how many largest files to list")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    items, skipped = [], []
    for path in iter_files(args.paths):
        if path == "-":
            text, err = sys.stdin.read(), None
            name = "<stdin>"
        else:
            text, err = read_text(path)
            name = path
        if err:
            skipped.append({"path": name, "reason": err})
            continue
        items.append({"path": name, "tokens": estimate_tokens(text), "chars": len(text)})

    total = sum(i["tokens"] for i in items)
    warn_at = math.floor(args.threshold * args.warn_percent / 100)
    percent = round(total / args.threshold * 100) if args.threshold > 0 else 0
    level = "over" if total >= args.threshold else "warn" if total >= warn_at else "ok"
    items.sort(key=lambda i: i["tokens"], reverse=True)

    if args.json:
        print(json.dumps({"total_tokens": total, "threshold": args.threshold, "warn_at": warn_at,
                          "percent": percent, "level": level, "files": items, "skipped": skipped}, indent=2))
        return 1 if level == "over" else 0

    icon = {"ok": "🟢 within budget", "warn": "🟡 NEAR LIMIT, consider narrowing context",
            "over": "🔴 OVER BUDGET, trim before sending"}[level]
    print(f"Context budget: ~{total:,} / {args.threshold:,} tokens ({percent}%)")
    print(icon)
    if items:
        print(f"\nLargest ({min(args.top, len(items))} of {len(items)} files):")
        for i in items[: args.top]:
            print(f"  ~{i['tokens']:>8,} tok  {i['path']}")
    if skipped:
        print(f"\nSkipped {len(skipped)} unreadable/binary file(s).")
    return 1 if level == "over" else 0


if __name__ == "__main__":
    sys.exit(main())
