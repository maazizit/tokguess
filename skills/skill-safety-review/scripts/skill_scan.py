#!/usr/bin/env python3
"""Static safety scan for AI agent skills (SKILL.md + scripts) before you install them.

Standard library only. Offline: never executes or imports the scanned files.
Prints findings with file:line evidence and a SAFE / REVIEW / DANGEROUS verdict.
"""
import argparse
import json
import os
import re
import sys

SEV_ORDER = {"critical": 3, "high": 2, "medium": 1, "low": 0}
MAX_BYTES = 1_000_000
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".tar", ".woff",
              ".woff2", ".ttf", ".mp3", ".mp4", ".mov", ".pyc", ".so", ".dll", ".exe", ".bin"}

# (id, severity, category, regex, message)
RULES = [
    # --- remote code execution / downloads
    ("RCE-001", "critical", "remote-exec", r"(curl|wget)[^\n|;]*\|\s*(sudo\s+)?(ba|z|da)?sh\b", "Pipes a download straight into a shell"),
    ("RCE-002", "critical", "remote-exec", r"(curl|wget)[^\n|;]*\|\s*(sudo\s+)?(python3?|node|perl|ruby)\b", "Pipes a download straight into an interpreter"),
    ("RCE-003", "high", "remote-exec", r"\b(eval|exec)\s*\(\s*(requests|urllib|urlopen|fetch|base64|b64decode|atob)", "Evaluates downloaded or decoded content"),
    ("RCE-004", "high", "remote-exec", r"(Invoke-Expression|\biex\b)\s*[\(\"']?.*(DownloadString|Invoke-WebRequest|iwr)", "PowerShell downloads and executes code"),
    # --- obfuscation
    ("OBF-001", "high", "obfuscation", r"(base64\s+(-d|--decode)|b64decode|atob\s*\()[^\n]*(\|\s*(ba)?sh|eval|exec)", "Decodes a hidden payload and runs it"),
    ("OBF-002", "medium", "obfuscation", r"[A-Za-z0-9+/]{200,}={0,2}", "Very long encoded-looking string"),
    ("OBF-003", "medium", "obfuscation", r"(\\x[0-9a-fA-F]{2}){12,}", "Long hex-escaped string"),
    ("OBF-004", "medium", "obfuscation", r"(chr\(\d+\)\s*\+\s*){6,}", "Builds a string character by character"),
    # --- sensitive data access
    ("SEC-001", "critical", "secrets", r"(~|\$HOME|/home/[^/\s]+|/Users/[^/\s]+)?/?\.ssh/(id_[a-z0-9]+|authorized_keys|config)", "Touches SSH keys or config"),
    ("SEC-002", "high", "secrets", r"\.aws/credentials|\.config/gcloud|\.azure/|\.kube/config|\.docker/config\.json|\.npmrc|\.pypirc|\.netrc", "Touches cloud or package-registry credentials"),
    ("SEC-003", "high", "secrets", r"(^|[\s/'\"=])\.env(\.[a-z]+)?(['\"\s]|$)", "Reads a .env file"),
    ("SEC-004", "high", "secrets", r"Login Data|Cookies\.sqlite|Local State|logins\.json|keychain|wallet\.dat|\.gnupg", "Touches browser, keychain or wallet data"),
    ("SEC-005", "medium", "secrets", r"os\.environ(\.items\(\)|\s*\)\s*\))|process\.env\s*\)|\benv\b\s*\|\s*(curl|nc)|\bprintenv\b", "Dumps all environment variables"),
    ("SEC-006", "medium", "secrets", r"(API_KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*\s*=\s*['\"][A-Za-z0-9_\-]{16,}['\"]", "Hard-coded credential-looking value"),
    ("SEC-007", "high", "secrets", r"AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{32,}|xox[baprs]-[A-Za-z0-9-]{10,}", "Looks like a real leaked API key"),
    # --- network / exfiltration
    ("NET-001", "medium", "network", r"\b(requests\.(get|post|put)|urllib\.request|urlopen|http\.client|httpx\.|aiohttp|fetch\s*\(|axios\.|XMLHttpRequest)", "Makes network requests"),
    ("NET-002", "medium", "network", r"\b(curl|wget|nc|ncat|netcat|socat|scp|rsync|ftp|telnet)\s+\S", "Calls a network command-line tool"),
    ("NET-003", "high", "exfiltration", r"(requests\.post|curl\s[^\n]*(-d|--data|-F|--upload-file)|fetch\s*\([^\n]*method\s*:\s*['\"]POST)", "Sends data out to a remote server"),
    ("NET-004", "critical", "exfiltration", r"(discord(app)?\.com/api/webhooks|hooks\.slack\.com|api\.telegram\.org/bot|pastebin\.com|webhook\.site|ngrok\.(io|app)|requestbin|pipedream\.net|burpcollaborator|oast\.)", "Known exfiltration or tunnelling endpoint"),
    ("NET-005", "medium", "network", r"https?://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", "Contacts a raw IP address"),
    ("NET-006", "critical", "exfiltration", r"/dev/tcp/|bash\s+-i\s*>&|nc\s+(-e|-c)\s", "Reverse-shell pattern"),
    # --- destructive / privilege / persistence
    ("SYS-001", "high", "destructive", r"rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+(/|~|\$HOME|\*)(\s|$)", "Recursive delete of root, home or wildcard"),
    ("SYS-002", "medium", "destructive", r"\b(mkfs|dd\s+if=|shred|git\s+push\s+(-f|--force)|git\s+reset\s+--hard|DROP\s+(TABLE|DATABASE))", "Destructive command"),
    ("SYS-003", "high", "privilege", r"\bsudo\b|chmod\s+(-R\s+)?[0-7]*777|chown\s+-R\s+root|setuid", "Escalates privileges or loosens permissions"),
    ("SYS-004", "high", "persistence", r"crontab|/etc/cron|\.bashrc|\.zshrc|\.profile|\.bash_profile|LaunchAgents|LaunchDaemons|systemctl\s+(enable|start)|/etc/systemd|schtasks|HKEY_.*\\Run", "Installs itself to run later (persistence)"),
    ("SYS-005", "medium", "persistence", r"\.git/hooks|git\s+config\s+--global|core\.hooksPath", "Modifies git hooks or global git config"),
    ("SYS-006", "medium", "supply-chain", r"\b(pip3?\s+install|npm\s+(i|install)\s+(-g\s+)?|npx\s+-y|uv\s+(pip|tool)\s+install|gem\s+install|go\s+install|cargo\s+install)\b", "Installs packages at run time"),
    ("SYS-007", "low", "execution", r"\bsubprocess\.|os\.system\s*\(|os\.popen|child_process|shell\s*=\s*True", "Spawns shell commands"),
    ("SYS-008", "medium", "execution", r"(?<![\w.])(eval|exec)\s*\(", "Uses eval/exec on dynamic content"),
    ("SYS-009", "medium", "agent-config", r"\.claude/(settings|hooks|commands|agents)|CLAUDE\.md|AGENTS\.md|\.cursor/rules|\.mcp\.json|claude_desktop_config", "Modifies agent settings, hooks or MCP config"),
    ("SYS-010", "high", "agent-config", r"dangerously-skip-permissions|--yolo|bypassPermissions|allowedTools\s*[:=]\s*\[?\s*['\"]\*|Bash\(\*\)", "Disables or widens agent permission checks"),
]

# Prompt-injection / hidden-instruction rules. Applied to every text file, mainly SKILL.md and docs.
INJECTION_RULES = [
    ("INJ-001", "critical", "prompt-injection", r"ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|your)\s+(instructions|rules|prompts?|guidelines)", "Tries to override earlier instructions"),
    ("INJ-002", "critical", "prompt-injection", r"(do\s+not|don'?t|never)\s+(tell|inform|reveal|mention|show|disclose)[^\n.]{0,40}(user|human|operator)", "Asks the agent to hide actions from the user"),
    ("INJ-003", "high", "prompt-injection", r"(disregard|forget|override|bypass)\s+(the\s+)?(system\s+prompt|safety|guardrails?|security\s+(rules|checks|policy))", "Tries to bypass safety rules"),
    ("INJ-004", "high", "prompt-injection", r"(you\s+are\s+now|from\s+now\s+on\s+you\s+are|act\s+as)\s+(an?\s+)?(unrestricted|jailbroken|DAN|developer\s+mode)", "Jailbreak persona"),
    ("INJ-005", "high", "prompt-injection", r"(send|upload|post|forward|exfiltrate|email)[^\n.]{0,60}(\.env|credentials?|api[\s_-]?keys?|tokens?|passwords?|ssh|secrets?|conversation|chat\s+history)", "Instructs the agent to send secrets or history elsewhere"),
    ("INJ-006", "high", "prompt-injection", r"without\s+(asking|confirmation|permission|telling|notifying|the\s+user)", "Acts without asking the user"),
    ("INJ-007", "medium", "prompt-injection", r"(always|silently|quietly|secretly)\s+(run|execute|install|download|fetch|send|append)\b(?!ed|ing|s\b)", "Silent or unconditional actions"),
    ("INJ-008", "medium", "prompt-injection", r"</?(system|assistant|instructions?)>|\[/?INST\]|<\|im_start\|>|<\|system\|>", "Fake system/role markers"),
    ("INJ-009", "high", "prompt-injection", r"<!--[\s\S]{0,400}?(ignore|instruction|system|execute|run|send|curl|secret|token)[\s\S]{0,400}?-->", "Instruction hidden in an HTML comment"),
]

HIDDEN_CHARS = re.compile("[​‌‍⁠﻿‪-‮⁦-⁩]")
TAG_CHARS = re.compile("[\U000e0000-\U000e007f]")


def compile_rules(rules):
    return [(rid, sev, cat, re.compile(rx, re.I), msg) for rid, sev, cat, rx, msg in rules]


CODE_RULES = compile_rules(RULES)
INJ_RULES = compile_rules(INJECTION_RULES)


def iter_files(root):
    if os.path.isfile(root):
        yield root
        return
    for dirpath, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fn in sorted(files):
            yield os.path.join(dirpath, fn)


def read_text(path):
    try:
        if os.path.getsize(path) > MAX_BYTES:
            return None, "too large"
        with open(path, "rb") as fh:
            data = fh.read()
    except OSError as e:
        return None, str(e)
    if b"\x00" in data[:4096]:
        return None, "binary"
    return data.decode("utf-8", errors="replace"), None


def snippet(line, m):
    s = line.strip()
    if len(s) > 140:
        start = max(0, m.start() - 50)
        s = "…" + line[start:start + 120].strip() + "…"
    return s


def scan_text(rel, text):
    findings = []
    text = text.lstrip("\ufeff")  # a leading BOM is normal
    is_doc = rel.lower().endswith((".md", ".txt", ".mdx", ".rst"))
    lines = text.splitlines()
    in_fence = False
    for i, line in enumerate(lines, 1):
        if line.lstrip().startswith("```"):
            in_fence = not in_fence
        for rid, sev, cat, rx, msg in CODE_RULES:
            m = rx.search(line)
            if not m:
                continue
            # In prose docs, a mention of a command is weaker evidence than in code.
            eff = sev
            if is_doc and sev in ("critical", "high") and not in_fence and not re.match(r"\s*(\$|#!|>\s*\$|\s{4})", line):
                eff = "medium" if sev == "high" else "high"
            findings.append({"id": rid, "severity": eff, "category": cat, "file": rel, "line": i,
                             "message": msg, "evidence": snippet(line, m)})
        for rid, sev, cat, rx, msg in INJ_RULES:
            if rid == "INJ-009":
                continue
            m = rx.search(line)
            if m:
                findings.append({"id": rid, "severity": sev, "category": cat, "file": rel, "line": i,
                                 "message": msg, "evidence": snippet(line, m)})
        if HIDDEN_CHARS.search(line) or TAG_CHARS.search(line):
            findings.append({"id": "INJ-010", "severity": "high", "category": "prompt-injection", "file": rel,
                             "line": i, "message": "Invisible or bidirectional Unicode characters (can hide instructions)",
                             "evidence": repr(line.strip()[:100])})
    # Multi-line HTML comment check
    for rid, sev, cat, rx, msg in INJ_RULES:
        if rid != "INJ-009":
            continue
        for m in rx.finditer(text):
            line_no = text.count("\n", 0, m.start()) + 1
            findings.append({"id": rid, "severity": sev, "category": cat, "file": rel, "line": line_no,
                             "message": msg, "evidence": snippet(m.group(0).replace("\n", " "), m)})
    return findings


def structure_checks(root):
    findings = []
    if os.path.isdir(root):
        skill_md = os.path.join(root, "SKILL.md")
        if not os.path.isfile(skill_md):
            findings.append({"id": "STR-001", "severity": "low", "category": "structure", "file": ".",
                             "line": 0, "message": "No SKILL.md found at the folder root", "evidence": ""})
    return findings


def dedupe(findings):
    seen, out = set(), []
    for f in findings:
        key = (f["id"], f["file"], f["line"])
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def verdict_of(findings):
    crit = sum(1 for f in findings if f["severity"] == "critical")
    high = sum(1 for f in findings if f["severity"] == "high")
    med = sum(1 for f in findings if f["severity"] == "medium")
    if crit:
        return "DANGEROUS"
    if high or med >= 4:
        return "REVIEW"
    return "SAFE"


def main():
    ap = argparse.ArgumentParser(description="Scan an AI agent skill for risky behavior before installing it.")
    ap.add_argument("path", help="skill folder or single file")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--min-severity", choices=list(SEV_ORDER), default="low", help="hide findings below this level")
    args = ap.parse_args()

    if not os.path.exists(args.path):
        print(f"Path not found: {args.path}", file=sys.stderr)
        return 2

    root = os.path.abspath(args.path)
    base = root if os.path.isdir(root) else os.path.dirname(root)
    findings, scanned, skipped = [], 0, []
    for path in iter_files(root):
        rel = os.path.relpath(path, base)
        if os.path.splitext(path)[1].lower() in BINARY_EXT:
            skipped.append({"file": rel, "reason": "binary file type (not scanned, check it by hand)"})
            continue
        text, err = read_text(path)
        if err:
            skipped.append({"file": rel, "reason": err})
            continue
        scanned += 1
        findings.extend(scan_text(rel, text))
    findings.extend(structure_checks(root))
    findings = dedupe(findings)
    findings.sort(key=lambda f: (-SEV_ORDER[f["severity"]], f["file"], f["line"]))
    verdict = verdict_of(findings)
    shown = [f for f in findings if SEV_ORDER[f["severity"]] >= SEV_ORDER[args.min_severity]]
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in SEV_ORDER}

    if args.json:
        print(json.dumps({"verdict": verdict, "files_scanned": scanned, "counts": counts,
                          "findings": shown, "skipped": skipped}, indent=2, ensure_ascii=False))
    else:
        icon = {"SAFE": "🟢", "REVIEW": "🟡", "DANGEROUS": "🔴"}[verdict]
        print(f"{icon} Verdict: {verdict}   ({scanned} files scanned)")
        print("   " + "  ".join(f"{s}: {counts[s]}" for s in SEV_ORDER))
        for f in shown:
            loc = f"{f['file']}:{f['line']}" if f["line"] else f["file"]
            print(f"\n[{f['severity'].upper()}] {f['id']} {f['message']}\n  {loc}\n  > {f['evidence']}")
        if skipped:
            print(f"\nNot scanned ({len(skipped)}): " + ", ".join(s["file"] for s in skipped[:8]))
        print("\nThis is a static pattern scan. It can miss things and can flag harmless code. "
              "A SAFE verdict is not a guarantee.")
    return {"SAFE": 0, "REVIEW": 1, "DANGEROUS": 2}[verdict]


if __name__ == "__main__":
    sys.exit(main())
