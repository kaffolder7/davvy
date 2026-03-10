import json
import os
import subprocess
from pathlib import Path

BASE_SHA = os.environ["BASE_SHA"]
HEAD_SHA = os.environ["HEAD_SHA"]
GITHUB_OUTPUT = os.environ["GITHUB_OUTPUT"]

DOC_EXTENSIONS = {
    ".md",
    ".mdx",
    ".rst",
    ".txt",
}

DOC_EXACT = {
    "LICENSE",
    "CHANGELOG",
}

NOISY_PATTERNS = (
    "package-lock.json",
    "composer.lock",
)

NOISY_PREFIXES = (
    "public/build/",
    "dist/",
    "coverage/",
    "node_modules/",
)


def run_git_diff() -> None:
    diff = subprocess.check_output(
        ["git", "diff", "--unified=0", BASE_SHA, HEAD_SHA],
        text=True,
    )
    Path("pr.diff").write_text(diff)

    changed = subprocess.check_output(
        ["git", "diff", "--name-only", BASE_SHA, HEAD_SHA],
        text=True,
    )
    Path("changed_files.txt").write_text(changed)


def read_changed_files() -> list[str]:
    path = Path("changed_files.txt")
    if not path.exists():
        return []
    return [line.strip() for line in path.read_text().splitlines() if line.strip()]


def is_docs_only_file(path: str) -> bool:
    p = Path(path)

    if path.startswith("docs/"):
        return True
    if path.startswith(".github/ISSUE_TEMPLATE/"):
        return True
    if path.startswith(".github/PULL_REQUEST_TEMPLATE"):
        return True
    if path.startswith(".github/") and p.suffix in DOC_EXTENSIONS:
        return True

    if (
        p.name in DOC_EXACT
        or p.name.startswith("LICENSE.")
        or p.name.startswith("CHANGELOG.")
    ):
        return True

    return p.suffix in DOC_EXTENSIONS


def is_noisy_file(path: str) -> bool:
    if path in NOISY_PATTERNS:
        return True
    return any(path.startswith(prefix) for prefix in NOISY_PREFIXES)


def truncate_diff(max_bytes: int = 140000) -> None:
    diff_path = Path("pr.diff")
    if not diff_path.exists():
        return

    raw = diff_path.read_bytes()
    if len(raw) > max_bytes:
        diff_path.write_bytes(raw[:max_bytes])


def build_changed_files_filtered(changed_files: list[str]) -> list[str]:
    filtered = [f for f in changed_files if not is_noisy_file(f)]
    if not filtered:
        filtered = changed_files[:]

    Path("changed_files_filtered.txt").write_text(
        "".join(f"{item}\n" for item in filtered)
    )
    return filtered


def build_files_json(filtered_files: list[str], max_file_bytes: int = 35000) -> None:
    result: dict[str, str] = {}

    for file_path in filtered_files:
        if is_noisy_file(file_path):
            continue

        p = Path(file_path)
        if not p.is_file():
            continue

        try:
            size = p.stat().st_size
        except OSError:
            continue

        if size <= max_file_bytes:
            result[file_path] = p.read_text()

    Path("files.json").write_text(json.dumps(result, indent=2))


def write_defaults() -> None:
    Path("files.json").write_text("{}")
    Path("related_files.json").write_text("{}")
    Path("changed_files_filtered.txt").write_text("")
    Path("related_context_files.txt").write_text("")


def write_output(name: str, value: str) -> None:
    with open(GITHUB_OUTPUT, "a", encoding="utf-8") as f:
        f.write(f"{name}={value}\n")


def main() -> None:
    run_git_diff()
    changed_files = read_changed_files()

    if not changed_files:
        write_output("has_changes", "false")
        write_output("docs_only", "false")
        write_defaults()
        return

    write_output("has_changes", "true")

    docs_only = all(is_docs_only_file(path) for path in changed_files)
    write_output("docs_only", "true" if docs_only else "false")

    truncate_diff()
    filtered = build_changed_files_filtered(changed_files)
    build_files_json(filtered)


if __name__ == "__main__":
    main()
