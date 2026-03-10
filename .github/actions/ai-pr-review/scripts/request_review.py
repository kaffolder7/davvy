import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
PR_TITLE = os.environ["PR_TITLE"]
PR_NUMBER = os.environ["PR_NUMBER"]
REPO = os.environ["REPO"]

SYSTEM_PROMPT = """You are reviewing a pull request for Davvy, a Laravel + React application with:
- Laravel backend
- React + Vite frontend
- built-in SabreDAV CalDAV/CardDAV behavior
- Docker-oriented deployment
- backup and restore capabilities
- compatibility mode support for DAV clients

Return ONLY valid JSON in exactly this shape:

{
  "summary": "short overall verdict",
  "findings": [
    {
      "path": "relative/file/path.ext",
      "line": 123,
      "category": "security|correctness|tests|performance|breaking-change",
      "severity": "high|medium|low",
      "title": "short title",
      "body": "1-3 sentence explanation with a concrete fix or check"
    }
  ]
}

Focus on high-signal findings only.

Prioritize:
- Laravel auth/authz issues, policy/gate omissions, mass assignment, validation gaps
- route/controller/service bugs
- migration/data integrity risks
- config/env/runtime regressions
- backup/restore or scheduler regressions
- React state/effect/data-fetching bugs
- backend/frontend API contract mismatches
- DAV interoperability or compatibility-mode regressions
- missing tests for risky backend, frontend, routing, migration, or config changes

Ignore:
- formatting/style nits
- lockfile churn
- docs wording
- speculative micro-optimizations
- issues already fully covered by formatter/linter unless there is real runtime risk

You are also given related repo context files that may not be part of the diff.
Use them to:
- verify whether authorization, validation, model rules, routes, config, and tests still align
- detect backend/frontend contract mismatches
- detect missing or stale tests near the changed code
- avoid making claims that contradict nearby implementation context

Extra guidance:
- be especially suspicious when changes touch routes/, app/Http, app/Models, database/migrations, config/, or resources/js/ without corresponding tests/
- prefer no finding over a weak finding
- prioritize findings supported by both the diff and related context

Rules:
- only use line numbers from the NEW version of the changed file
- keep findings to at most 8
- if there are no meaningful findings, return an empty findings array
"""


def read_file_or_empty(path: str) -> str:
    p = Path(path)
    if p.exists():
        return p.read_text()
    return ""


def ensure_exists(path: str, default_content: str) -> None:
    p = Path(path)
    if not p.exists():
        p.write_text(default_content)


def build_user_input() -> str:
    ensure_exists("changed_files_filtered.txt", "")
    ensure_exists("pr.diff", "")
    ensure_exists("files.json", "{}")
    ensure_exists("related_context_files.txt", "")
    ensure_exists("related_files.json", "{}")

    parts = [
        f"Repository: {REPO}",
        f"PR: #{PR_NUMBER}",
        f"Title: {PR_TITLE}",
        "",
        "Changed files:",
        read_file_or_empty("changed_files_filtered.txt"),
        "",
        "Diff:",
        "```diff",
        read_file_or_empty("pr.diff"),
        "```",
        "",
        "Small changed file contents as JSON map:",
        read_file_or_empty("files.json"),
        "",
        "Related repo context files:",
        read_file_or_empty("related_context_files.txt"),
        "",
        "Related repo context contents as JSON map:",
        read_file_or_empty("related_files.json"),
    ]
    return "\n".join(parts)


def call_openai(system_prompt: str, user_input: str) -> str:
    payload = {
        "model": "gpt-4.1-mini",
        "input": [
            {
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            },
            {
                "role": "user",
                "content": [{"type": "input_text", "text": user_input}],
            },
        ],
    }

    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urllib.request.urlopen(req) as response:
        response_json = json.loads(response.read().decode("utf-8"))

    Path("response.json").write_text(json.dumps(response_json, indent=2))

    if "output_text" in response_json and response_json["output_text"]:
        return str(response_json["output_text"]).strip()

    chunks: list[str] = []
    for output_item in response_json.get("output", []):
        for content_item in output_item.get("content", []):
            if content_item.get("type") == "output_text":
                text = content_item.get("text")
                if text:
                    chunks.append(str(text))

    return "\n".join(chunks).strip()


def validate_findings_json(raw_text: str) -> dict:
    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        print("Model output was not valid JSON.", file=sys.stderr)
        print(raw_text, file=sys.stderr)
        raise exc

    if not isinstance(parsed, dict):
        raise ValueError("Model output must be a JSON object.")

    if "summary" not in parsed:
        parsed["summary"] = ""
    if "findings" not in parsed or not isinstance(parsed["findings"], list):
        parsed["findings"] = []

    return parsed


def write_fallback_output(summary: str) -> None:
    payload = {"summary": summary, "findings": []}
    serialized = json.dumps(payload, indent=2)
    Path("findings_raw.json").write_text(serialized)
    Path("findings.json").write_text(serialized)


def extract_openai_error_message(exc: urllib.error.HTTPError) -> str:
    try:
        raw = exc.read().decode("utf-8", errors="replace")
    except Exception:
        return ""

    if not raw:
        return ""

    try:
        parsed = json.loads(raw)
        message = parsed.get("error", {}).get("message")
        if message:
            return str(message)
    except Exception:
        pass

    return raw.strip()


def main() -> None:
    user_input = build_user_input()
    Path("system_prompt.txt").write_text(SYSTEM_PROMPT)
    Path("user_input.txt").write_text(user_input)

    if not OPENAI_API_KEY:
        summary = (
            "Skipped AI review because OPENAI_API_KEY is not configured in this workflow run."
        )
        write_fallback_output(summary)
        print(summary, file=sys.stderr)
        return

    try:
        raw_output = call_openai(SYSTEM_PROMPT, user_input)
    except urllib.error.HTTPError as exc:
        detail = extract_openai_error_message(exc)
        if exc.code == 401:
            summary = (
                "Skipped AI review because OpenAI authentication failed (HTTP 401). "
                "Check OPENAI_API_KEY in repository or organization secrets."
            )
        else:
            summary = f"Skipped AI review because the OpenAI request failed (HTTP {exc.code})."

        write_fallback_output(summary)
        print(summary, file=sys.stderr)
        if detail:
            Path("openai_error.txt").write_text(detail)
            print("OpenAI error detail captured in openai_error.txt.", file=sys.stderr)
        return
    except Exception as exc:
        summary = (
            "Skipped AI review because the OpenAI request failed before completion: "
            f"{type(exc).__name__}."
        )
        write_fallback_output(summary)
        print(summary, file=sys.stderr)
        return

    if not raw_output:
        summary = "Skipped AI review because OpenAI returned an empty response."
        write_fallback_output(summary)
        print(summary, file=sys.stderr)
        return

    Path("findings_raw.json").write_text(raw_output)

    try:
        parsed = validate_findings_json(raw_output)
    except Exception:
        summary = (
            "Skipped AI review because OpenAI returned output that was not valid JSON."
        )
        write_fallback_output(summary)
        print(summary, file=sys.stderr)
        return

    Path("findings.json").write_text(json.dumps(parsed, indent=2))


if __name__ == "__main__":
    main()
