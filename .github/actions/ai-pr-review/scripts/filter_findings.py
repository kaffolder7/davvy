import json
import os
import subprocess
from pathlib import Path

BASE_SHA = os.environ["BASE_SHA"]
HEAD_SHA = os.environ["HEAD_SHA"]

findings = json.loads(Path("findings.json").read_text())


def changed_new_lines(path: str) -> set[int]:
    try:
        diff = subprocess.check_output(
            ["git", "diff", "--unified=0", BASE_SHA, HEAD_SHA, "--", path],
            text=True,
        )
    except subprocess.CalledProcessError:
        return set()

    lines: set[int] = set()

    for line in diff.splitlines():
        if not line.startswith("@@"):
            continue

        try:
            plus_part = line.split("+", 1)[1].split(" ", 1)[0]
            if "," in plus_part:
                start_s, count_s = plus_part.split(",", 1)
                start = int(start_s)
                count = int(count_s)
            else:
                start = int(plus_part)
                count = 1

            for n in range(start, start + count):
                lines.add(n)
        except Exception:
            continue

    return lines


def read_changed_files() -> list[str]:
    p = Path("changed_files_filtered.txt")
    if not p.exists():
        return []
    return [line.strip() for line in p.read_text().splitlines() if line.strip()]


def is_test_file(path: str) -> bool:
    return path.startswith("tests/")


def is_risky_backend_file(path: str) -> bool:
    risky_prefixes = (
        "app/Http/",
        "app/Models/",
        "app/Policies/",
        "app/Services/",
        "routes/",
        "database/migrations/",
        "config/",
    )
    return (
        path.endswith(".php")
        and path.startswith(risky_prefixes)
        or path == ".env.example"
    )


def pick_missing_test_anchor(changed_files: list[str]) -> tuple[str, int] | None:
    for path in changed_files:
        if is_risky_backend_file(path):
            lines = changed_new_lines(path)
            if lines:
                return path, min(lines)
            return path, 1
    return None


severity_rank = {"high": 3, "medium": 2, "low": 1}
valid: list[dict] = []
cache: dict[str, set[int]] = {}

for finding in findings.get("findings", []):
    path = finding.get("path")
    line = finding.get("line")

    if not path or not isinstance(line, int):
        continue

    if path not in cache:
        cache[path] = changed_new_lines(path)

    if line not in cache[path]:
        continue

    finding["severity"] = str(finding.get("severity", "medium")).lower().strip()
    finding["category"] = str(finding.get("category", "correctness")).lower().strip()
    finding["title"] = str(finding.get("title", "Finding")).strip()
    finding["body"] = str(finding.get("body", "")).strip()

    valid.append(finding)

# Dedupe similar findings by path/category/normalized title
deduped: dict[tuple[str, str, str], dict] = {}

for finding in valid:
    key = (
        finding["path"],
        finding["category"],
        " ".join(finding["title"].lower().split())[:120],
    )
    existing = deduped.get(key)

    if existing is None:
        deduped[key] = finding
        continue

    existing_rank = severity_rank.get(existing["severity"], 0)
    new_rank = severity_rank.get(finding["severity"], 0)

    if new_rank > existing_rank:
        deduped[key] = finding
    elif new_rank == existing_rank and finding["line"] < existing["line"]:
        deduped[key] = finding

result = list(deduped.values())

# Automatic missing-test detection
changed_files = read_changed_files()
tests_changed = any(is_test_file(path) for path in changed_files)
risky_backend_changed = any(is_risky_backend_file(path) for path in changed_files)
has_existing_tests_finding = any(
    finding.get("category") == "tests" for finding in result
)

if risky_backend_changed and not tests_changed and not has_existing_tests_finding:
    anchor = pick_missing_test_anchor(changed_files)
    if anchor is not None:
        anchor_path, anchor_line = anchor
        result.append(
            {
                "path": anchor_path,
                "line": anchor_line,
                "category": "tests",
                "severity": "medium",
                "title": "Risky backend change without test updates",
                "body": (
                    "This pull request changes backend routing, HTTP, model, policy, "
                    "migration, or config logic but does not modify any files under "
                    "`tests/`. Consider adding or updating tests to cover the changed behavior."
                ),
            }
        )

result.sort(
    key=lambda item: (
        -severity_rank.get(item.get("severity", "low"), 0),
        item.get("path", ""),
        item.get("line", 0),
    )
)

Path("findings_filtered.json").write_text(
    json.dumps(
        {
            "summary": findings.get("summary", ""),
            "findings": result[:8],
        },
        indent=2,
    )
)
