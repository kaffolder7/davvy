# AI-Assisted PR Reviews

Davvy includes an automated pull request reviewer designed to help maintain code quality and catch common issues early.

The reviewer analyzes:

- the pull request diff
- related files in the repository
- relevant Laravel / React patterns

and posts structured feedback directly in the PR.

## What it looks for

Examples of issues the AI may flag:

- missing Laravel authorization checks
- validation gaps in FormRequests
- migrations that could break data integrity
- React state / API contract mismatches
- risky backend changes without updated tests

## Severity indicators

The AI uses the following severity markers:

🔴 **High** — likely bug, security risk, or breaking change  
🟡 **Medium** — potential correctness or design concern  
🔵 **Low** — minor improvement or observation

## Re-running the review

Comment the following in a pull request:

```
/ai review
```

This will trigger a fresh automated review.

## Limitations

The AI reviewer:

- may occasionally produce false positives
- cannot fully understand runtime behavior
- should not replace human code review

Maintainers always make the final decision on changes.
