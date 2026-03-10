import os

from github_api import github_delete, github_get

repo = os.environ["REPO"]
pr_number = os.environ["PR_NUMBER"]
token = os.environ["GH_TOKEN"]

review_comments = github_get(
    f"https://api.github.com/repos/{repo}/pulls/{pr_number}/comments?per_page=100",
    token,
)

for comment in review_comments:
    body = comment.get("body") or ""
    if body.startswith("[AI-REVIEW]"):
        github_delete(
            f"https://api.github.com/repos/{repo}/pulls/comments/{comment['id']}",
            token,
        )

issue_comments = github_get(
    f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments?per_page=100",
    token,
)

for comment in issue_comments:
    body = comment.get("body") or ""
    if body.startswith("<!-- ai-pr-review-summary -->"):
        github_delete(
            f"https://api.github.com/repos/{repo}/issues/comments/{comment['id']}",
            token,
        )
