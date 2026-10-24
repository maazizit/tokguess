---
name: skill-safety-review
description: Scan an AI agent skill (SKILL.md plus scripts) for risky behavior BEFORE installing or running it, and get a SAFE / REVIEW / DANGEROUS verdict with file:line evidence. Use when the user asks "is this skill safe?", "check this skill before I install it", "audit this SKILL.md", or before running a skill, plugin or script downloaded from a marketplace, GitHub or a stranger.
---

# Skill Safety Review

Check a third-party skill before it gets access to your files, your terminal and your secrets. The scan is static and 100% offline: the skill is only read, never executed or imported.

## When to use

- The user is about to install or run a skill, plugin, hook or script from someone else.
- The user asks whether a skill is safe, or wants a second opinion on a SKILL.md.
- You are about to follow instructions that came from a downloaded file or a marketplace.

## How to run

Python 3, standard library only:

```bash
python3 scripts/skill_scan.py <skill-folder-or-file> [--json] [--min-severity low|medium|high|critical]
```

Exit code: `0` SAFE, `1` REVIEW, `2` DANGEROUS, so it works in scripts and CI.

## What it looks for

| Category | Examples |
|---|---|
| Remote execution | `curl ... \| sh`, running downloaded or base64-decoded code, `eval`/`exec` on fetched content |
| Secrets access | `~/.ssh`, `~/.aws/credentials`, `.env`, browser profiles, keychains, leaked API-key patterns |
| Exfiltration | POSTing data out, webhook/paste/tunnel endpoints, raw IP calls, reverse-shell patterns |
| Prompt injection | "ignore previous instructions", "don't tell the user", fake system tags, instructions hidden in HTML comments, invisible Unicode |
| Persistence | cron, shell profiles, launch agents, systemd, git hooks, changes to agent settings or MCP config |
| Destructive or privileged | `rm -rf /`, `sudo`, `chmod 777`, force-push, permission-bypass flags |
| Supply chain | packages installed at run time |
| Obfuscation | long encoded blobs, hex-escaped strings, strings built char by char |

Findings in prose docs (outside code blocks) are rated one level lower than the same pattern in code.

## Verdicts

| Verdict | Rule | What to tell the user |
|---|---|---|
| 🔴 DANGEROUS | at least one critical finding | Do not install. Show the evidence. |
| 🟡 REVIEW | any high finding, or 4+ medium findings | Read each flagged line. Install only if the behavior matches the skill's stated purpose. |
| 🟢 SAFE | nothing above | No known risky pattern found. This is not a guarantee. |

## How to report

1. Lead with the verdict and the count of findings.
2. List critical and high findings with `file:line` and the exact line.
3. For each, say in one sentence whether it is plausible for what the skill claims to do (a PDF skill calling `pip install` is normal; a formatter reading `~/.ssh` is not).
4. Give a clear recommendation: install, install after changes, or do not install.

Do not run the scanned skill's scripts to "see what happens".

## Limits (be honest about them)

- It is a pattern scan. It can miss obfuscated or novel attacks and can flag harmless code.
- It does not run the code, check dependencies for known vulnerabilities, or follow links.
- Binary files are listed as "not scanned" and need a manual look.
- A skill that scans itself will flag its own rule definitions; that is expected.
- A SAFE verdict lowers risk, it does not remove it. For anything handling secrets or production systems, also read the code.

Made by the author of TokGuess: https://github.com/maazizit/tokguess
