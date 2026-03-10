import json
import os
from collections import defaultdict

from github_api import github_post

repo = os.environ["REPO"]
pr_number = os.environ["PR_NUMBER"]
head_sha = os.environ["HEAD_SHA"]
token = os.environ["GH_TOKEN"]

data = json.load(open("findings_filtered.json"))

findings = data.get("findings", [])
summary = (data.get("summary") or "").strip()

comments = []
counts = {
    "security": 0,
    "correctness": 0,
    "tests": 0,
    "performance": 0,
    "breaking-change": 0,
}

severity_emoji = {
    "high": "🔴",
    "medium": "🟡",
    "low": "🔵",
}

file_map = defaultdict(list)

for finding in findings:
    category = finding.get("category", "correctness")
    severity = finding.get("severity", "medium").lower()
    severity_label = severity.upper()
    title = finding.get("title", "Finding")
    body = (finding.get("body") or "").strip()
    path = finding["path"]
    line = finding["line"]

    if category in counts:
        counts[category] += 1

    file_map[path].append(finding)

    emoji = severity_emoji.get(severity, "🟡")

    comments.append(
        {
            "path": path,
            "line": line,
            "side": "RIGHT",
            "body": f"[AI-REVIEW]\n**{emoji} {severity_label} · {category} · {title}**\n\n{body}",
        }
    )

file_summary_lines = []

for path, file_findings in sorted(file_map.items()):
    if not file_findings:
        continue

    file_summary_lines.append(f"**{path}**")

    for finding in sorted(
        file_findings,
        key=lambda item: (
            {"high": 0, "medium": 1, "low": 2}.get(item.get("severity", "medium"), 3),
            item.get("line", 0),
        ),
    ):
        severity = finding.get("severity", "medium").lower()
        emoji = severity_emoji.get(severity, "🟡")
        file_summary_lines.append(
            f"• {emoji} `{finding['category']}` — {finding['title']}"
        )

    file_summary_lines.append("")

tag_bits = [f"{k}:{v}" for k, v in counts.items() if v > 0]
tag_line = ", ".join(tag_bits) if tag_bits else "no tagged findings"

review_body = "🤖 **AI inline review**\n\n"

if summary:
    review_body += summary + "\n\n"

review_body += f"**Tags:** {tag_line}\n\n"
review_body += "**Severity legend:** 🔴 high · 🟡 medium · 🔵 low\n\n"

if file_summary_lines:
    review_body += "### Files with findings\n\n"
    review_body += "\n".join(file_summary_lines)

if not comments:
    review_body += "No high-signal inline findings were identified."

payload = {
    "commit_id": head_sha,
    "body": review_body,
    "event": "COMMENT",
    "comments": comments,
}

github_post(
    f"https://api.github.com/repos/{repo}/pulls/{pr_number}/reviews",
    payload,
    token,
)
