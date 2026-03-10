import json
import os
import urllib.request


def github_headers(token: str) -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def github_get(url: str, token: str):
    req = urllib.request.Request(url, headers=github_headers(token))
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def github_post(url: str, payload: dict, token: str):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers=github_headers(token),
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())


def github_delete(url: str, token: str):
    req = urllib.request.Request(
        url,
        headers=github_headers(token),
        method="DELETE",
    )
    with urllib.request.urlopen(req):
        pass
