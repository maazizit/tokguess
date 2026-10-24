#!/usr/bin/env python3
"""Summarize real Claude Code token usage and estimated cost from local JSONL logs.

Standard library only. Reads numeric usage fields only; never prints message text.
"""
import argparse
import json
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone

# USD per 1M tokens. Indicative only; override with --prices.
DEFAULT_PRICES = {
    "claude-opus": {"input": 15.0, "output": 75.0},
    "claude-sonnet": {"input": 3.0, "output": 15.0},
    "claude-haiku": {"input": 1.0, "output": 5.0},
    "claude-3-5-haiku": {"input": 0.8, "output": 4.0},
    "claude-3-haiku": {"input": 0.25, "output": 1.25},
}
FALLBACK = {"input": 3.0, "output": 15.0}
CACHE_READ_MULT = 0.10
CACHE_WRITE_MULT = 1.25


def resolve_price(model, prices):
    m = model.lower()
    best = None
    for key in prices:
        if key.lower() in m and (best is None or len(key) > len(best)):
            best = key
    return (prices[best], True) if best else (FALLBACK, False)


def cost_of(model, u, prices):
    p, known = resolve_price(model, prices)
    c = (u["input"] * p["input"]
         + u["output"] * p["output"]
         + u["cache_read"] * p["input"] * CACHE_READ_MULT
         + u["cache_write"] * p["input"] * CACHE_WRITE_MULT) / 1_000_000
    return c, known


def parse_ts(v):
    if v is None:
        return None
    try:
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v / 1000 if v > 1e11 else v, tz=timezone.utc)
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (ValueError, OSError):
        return None


def collect(root, since):
    """Return {(session, request): record}, keeping the last entry per request."""
    records = {}
    for dirpath, _dirs, files in os.walk(root):
        project = os.path.relpath(dirpath, root).split(os.sep)[0]
        for fn in files:
            if not fn.endswith(".jsonl"):
                continue
            path = os.path.join(dirpath, fn)
            try:
                fh = open(path, "r", encoding="utf-8", errors="replace")
            except OSError:
                continue
            with fh:
                for line in fh:
                    if '"usage"' not in line or '"assistant"' not in line:
                        continue
                    try:
                        d = json.loads(line)
                    except ValueError:
                        continue
                    msg = d.get("message") or {}
                    usage = msg.get("usage")
                    model = msg.get("model") or ""
                    if d.get("type") != "assistant" or not usage or not model or model.startswith("<"):
                        continue
                    ts = parse_ts(d.get("timestamp"))
                    if ts is None or ts < since:
                        continue
                    session = d.get("sessionId") or fn[:-6]
                    req = d.get("requestId") or d.get("uuid") or str(d.get("timestamp"))
                    records[(session, req)] = {
                        "ts": ts, "model": model, "project": project, "session": session,
                        "input": usage.get("input_tokens") or 0,
                        "output": usage.get("output_tokens") or 0,
                        "cache_read": usage.get("cache_read_input_tokens") or 0,
                        "cache_write": usage.get("cache_creation_input_tokens") or 0,
                    }
    return list(records.values())


def clean_project(name):
    return name.lstrip("-").replace("-", "/") if name.startswith("-") else name


def aggregate(recs, keyfn, prices):
    agg = defaultdict(lambda: {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0,
                               "cost": 0.0, "requests": 0, "estimated_price": False})
    for r in recs:
        a = agg[keyfn(r)]
        for k in ("input", "output", "cache_read", "cache_write"):
            a[k] += r[k]
        c, known = cost_of(r["model"], r, prices)
        a["cost"] += c
        a["requests"] += 1
        if not known:
            a["estimated_price"] = True
    return agg


def fmt_tok(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1000:
        return f"{n / 1000:.1f}k"
    return str(n)


def table(title, agg, top, sort_by_key=False):
    rows = sorted(agg.items(), key=(lambda kv: kv[0]) if sort_by_key else (lambda kv: kv[1]["cost"]),
                  reverse=not sort_by_key)[:top]
    print(f"\n{title}")
    print(f"  {'':<34}{'reqs':>6}{'input':>9}{'output':>9}{'c.read':>9}{'c.write':>9}{'cost':>10}")
    for key, a in rows:
        name = str(key)
        name = name if len(name) <= 33 else "…" + name[-32:]
        mark = "~" if a["estimated_price"] else " "
        print(f"  {name:<34}{a['requests']:>6}{fmt_tok(a['input']):>9}{fmt_tok(a['output']):>9}"
              f"{fmt_tok(a['cache_read']):>9}{fmt_tok(a['cache_write']):>9}{mark}${a['cost']:>8.2f}")


def main():
    ap = argparse.ArgumentParser(description="Real Claude Code token usage and cost from local logs.")
    ap.add_argument("--root", default=os.path.join(os.path.expanduser("~"), ".claude", "projects"))
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--since", help="YYYY-MM-DD (overrides --days)")
    ap.add_argument("--by", choices=["day", "model", "project", "session"])
    ap.add_argument("--top", type=int, default=10)
    ap.add_argument("--prices", help="JSON file: {model-substring: {input, output}} USD per 1M tokens")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    if not os.path.isdir(args.root):
        print(f"No logs found at {args.root}. Use --root to point to your Claude logs.", file=sys.stderr)
        return 2

    prices = dict(DEFAULT_PRICES)
    if args.prices:
        try:
            with open(args.prices, encoding="utf-8") as fh:
                prices.update(json.load(fh))
        except (OSError, ValueError) as e:
            print(f"Cannot read prices file: {e}", file=sys.stderr)
            return 2

    if args.since:
        since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
    else:
        since = datetime.now(timezone.utc) - timedelta(days=args.days)

    recs = collect(args.root, since)
    if not recs:
        print("No usage found in that period.")
        return 0

    keyfns = {
        "day": lambda r: r["ts"].astimezone().strftime("%Y-%m-%d"),
        "model": lambda r: r["model"],
        "project": lambda r: clean_project(r["project"]),
        "session": lambda r: r["session"][:8],
    }
    tot = aggregate(recs, lambda r: "total", prices)["total"]
    fresh_in = tot["input"] + tot["cache_read"] + tot["cache_write"]
    hit = round(100 * tot["cache_read"] / fresh_in) if fresh_in else 0
    all_tokens = tot["input"] + tot["output"] + tot["cache_read"] + tot["cache_write"]

    if args.json:
        views = [args.by] if args.by else list(keyfns)
        out = {"since": since.isoformat(), "requests": tot["requests"], "total_tokens": all_tokens,
               "cache_hit_percent": hit, "estimated_cost_usd": round(tot["cost"], 4)}
        for v in views:
            out[f"by_{v}"] = {k: {**a, "cost": round(a["cost"], 4)}
                              for k, a in aggregate(recs, keyfns[v], prices).items()}
        print(json.dumps(out, indent=2))
        return 0

    print(f"Claude Code usage since {since.astimezone().strftime('%Y-%m-%d')}: "
          f"{fmt_tok(all_tokens)} tokens, ~${tot['cost']:.2f} API-equivalent ({tot['requests']} requests)")
    print(f"Cache hit rate: {hit}%   (~ = model not in price table, fallback rate used)")
    views = [args.by] if args.by else ["day", "model", "project"]
    for v in views:
        table(f"By {v}", aggregate(recs, keyfns[v], prices), args.top, sort_by_key=(v == "day"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
