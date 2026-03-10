import json
import os
import subprocess
from pathlib import Path

GITHUB_OUTPUT = os.environ["GITHUB_OUTPUT"]


def read_lines(path: str) -> list[str]:
    p = Path(path)
    if not p.exists():
        return []
    return [line.strip() for line in p.read_text().splitlines() if line.strip()]


def safe_find(*args: str) -> list[str]:
    try:
        output = subprocess.check_output(
            ["find", *args], text=True, stderr=subprocess.DEVNULL
        )
        return [line.strip() for line in output.splitlines() if line.strip()]
    except subprocess.CalledProcessError:
        return []


def add_matches(
    candidates: set[str], items: list[str], limit: int | None = None
) -> None:
    if limit is not None:
        items = items[:limit]
    candidates.update(items)


def basename_no_ext(path: str) -> str:
    return Path(path).stem


def build_related_candidates(changed_files: list[str]) -> list[str]:
    candidates: set[str] = set()

    for file_path in changed_files:
        if file_path.startswith("app/Http/Controllers/") and file_path.endswith(".php"):
            base = basename_no_ext(file_path)
            stem = base.removesuffix("Controller")

            add_matches(
                candidates,
                safe_find("routes", "-maxdepth", "2", "-type", "f", "-name", "*.php"),
            )
            add_matches(
                candidates,
                safe_find("app/Http/Requests", "-type", "f", "-name", f"*{stem}*.php"),
            )
            add_matches(
                candidates,
                safe_find("app/Policies", "-type", "f", "-name", f"*{stem}*.php"),
            )
            add_matches(
                candidates,
                safe_find(
                    "tests",
                    "-type",
                    "f",
                    "(",
                    "-name",
                    f"*{stem}*.php",
                    "-o",
                    "-name",
                    f"*{base}*.php",
                    ")",
                ),
            )
            add_matches(
                candidates,
                safe_find("app/Models", "-type", "f", "-name", "*.php"),
                limit=12,
            )

        elif file_path.startswith("app/Models/") and file_path.endswith(".php"):
            base = basename_no_ext(file_path)

            add_matches(
                candidates,
                safe_find("app/Policies", "-type", "f", "-name", f"*{base}*.php"),
            )
            add_matches(
                candidates,
                safe_find(
                    "tests",
                    "-type",
                    "f",
                    "(",
                    "-name",
                    f"*{base}*.php",
                    "-o",
                    "-name",
                    f"*{base}*Test.php",
                    ")",
                ),
            )
            migrations = safe_find(
                "database/migrations", "-type", "f", "-name", "*.php"
            )
            add_matches(candidates, migrations[-20:])

        elif file_path.startswith("app/Http/Requests/") and file_path.endswith(".php"):
            base = basename_no_ext(file_path)
            stem = base.removesuffix("Request")

            add_matches(
                candidates,
                safe_find(
                    "app/Http/Controllers", "-type", "f", "-name", f"*{stem}*.php"
                ),
            )
            add_matches(
                candidates, safe_find("tests", "-type", "f", "-name", f"*{stem}*.php")
            )

        elif file_path.startswith("app/Policies/") and file_path.endswith(".php"):
            base = basename_no_ext(file_path)
            stem = base.removesuffix("Policy")

            add_matches(
                candidates,
                safe_find("app/Models", "-type", "f", "-name", f"*{stem}*.php"),
            )
            add_matches(
                candidates, safe_find("tests", "-type", "f", "-name", f"*{stem}*.php")
            )

        elif file_path.startswith("resources/js/"):
            stem = basename_no_ext(file_path)

            add_matches(
                candidates,
                safe_find("tests", "-type", "f", "(", "-name", f"*{stem}*", ")"),
            )
            add_matches(
                candidates,
                safe_find("app/Http/Controllers", "-type", "f", "-name", "*.php"),
                limit=12,
            )
            add_matches(candidates, safe_find("routes", "-type", "f", "-name", "*.php"))

        elif file_path.startswith("routes/") and file_path.endswith(".php"):
            add_matches(
                candidates,
                safe_find("app/Http/Controllers", "-type", "f", "-name", "*.php"),
                limit=20,
            )
            add_matches(
                candidates, safe_find("tests", "-type", "f", "-name", "*Route*")
            )

        elif file_path.startswith("database/migrations/") and file_path.endswith(
            ".php"
        ):
            add_matches(
                candidates,
                safe_find("app/Models", "-type", "f", "-name", "*.php"),
                limit=20,
            )
            add_matches(
                candidates,
                safe_find(
                    "tests",
                    "-type",
                    "f",
                    "(",
                    "-name",
                    "*Migration*",
                    "-o",
                    "-name",
                    "*Database*",
                    ")",
                ),
            )

        elif (
            file_path.startswith("config/")
            and file_path.endswith(".php")
            or file_path == ".env.example"
        ):
            add_matches(
                candidates, safe_find("app", "-type", "f", "-name", "*.php"), limit=20
            )
            add_matches(
                candidates, safe_find("tests", "-type", "f", "-name", "*Config*")
            )

    return sorted(candidates)


def build_related_context_files(
    changed_filtered: list[str], candidates: list[str]
) -> list[str]:
    changed_set = set(changed_filtered)
    result = [
        item for item in candidates if item not in changed_set and Path(item).is_file()
    ]
    result = result[:25]
    Path("related_context_files.txt").write_text(
        "".join(f"{item}\n" for item in result)
    )
    return result


def build_related_files_json(files: list[str], max_file_bytes: int = 25000) -> None:
    result: dict[str, str] = {}

    for file_path in files:
        p = Path(file_path)
        if not p.is_file():
            continue

        try:
            size = p.stat().st_size
        except OSError:
            continue

        if size <= max_file_bytes:
            result[file_path] = p.read_text()

    Path("related_files.json").write_text(json.dumps(result, indent=2))


def write_output(name: str, value: str) -> None:
    with open(GITHUB_OUTPUT, "a", encoding="utf-8") as f:
        f.write(f"{name}={value}\n")


def main() -> None:
    changed_filtered = read_lines("changed_files_filtered.txt")
    if not changed_filtered:
        Path("related_context_files.txt").write_text("")
        Path("related_files.json").write_text("{}")
        write_output("related_count", "0")
        return

    candidates = build_related_candidates(changed_filtered)
    related_files = build_related_context_files(changed_filtered, candidates)
    build_related_files_json(related_files)
    write_output("related_count", str(len(related_files)))


if __name__ == "__main__":
    main()
