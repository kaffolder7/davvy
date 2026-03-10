import json
import os
from pathlib import Path

from github_api import github_post

repo = os.environ["REPO"]
pr_number = os.environ["PR_NUMBER"]
token = os.environ["GH_TOKEN"]

docs_only = os.environ.get("DOCS_ONLY", "false") == "true"
has_changes = os.environ.get("HAS_CHANGES", "true") == "true"

if Path("findings_filtered.json").exists():
    data = json.loads(Path("findings_filtered.json").read_text())
    findings = data.get("findings", [])
    summary = (data.get("summary") or "").strip()
else:
    findings = []
    summary = ""

counts = {
    "security": 0,
    "correctness": 0,
    "tests": 0,
    "performance": 0,
    "breaking-change": 0,
}

for finding in findings:
    category = finding.get("category", "correctness")
    if category in counts:
        counts[category] += 1

lines = [
    "<!-- ai-pr-review-summary -->",
    "## AI PR Review Summary",
    "",
]

if not has_changes:
    lines.append("No changed files detected.")
elif docs_only:
    lines.append("Skipped AI review because this PR appears to be docs-only.")
else:
    lines.append(summary or "Automated review completed.")

lines += [
    "",
    "### Category counts",
]

for key, value in counts.items():
    lines.append(f"- `{key}`: {value}")

if findings:
    lines += ["", "### Findings"]
    for finding in findings:
        lines.append(
            f"- `{finding.get('category', 'correctness')}` / "
            f"`{finding.get('severity', 'medium')}` — "
            f"`{finding['path']}:{finding['line']}` — "
            f"{finding.get('title', 'Finding')}"
        )
else:
    lines += ["", "- No high-signal findings."]

payload = {"body": "\n".join(lines)}

github_post(
    f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments",
    payload,
    token,
)
