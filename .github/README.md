# .github

**Path:** `.github/`  
**Mapped:** 2026-07-28   **Depth:** L1   **Confidence:** high  
**Upstream docs:** none

## What this is

GitHub repository metadata for the **Victor-Rebuild** fork: issue form templates only. No workflows, actions, CODEOWNERS, or Dependabot configs observed in this tree.

## Why it exists

Standardizes bug reports and feature requests on  
https://github.com/Victor-Rebuild/victor-1.6-rebuild-2 (also linked from root `ABOUT.md`).

## Contents

| Entry | Type | What it is |
|---|---|---|
| `ISSUE_TEMPLATE/` | dir | GitHub issue templates |
| `ISSUE_TEMPLATE/bug_report.md` | file | Bug form: repro, expected, rebuild version, Vector 1.0/2.0; label `bug`; assignee `Switch-modder` |
| `ISSUE_TEMPLATE/feature_request.md` | file | Feature form; label `enhancement`; assignee `Switch-modder`; “anki-like” implementability note |

## Key entry points

- Open issues → GitHub picks templates from `ISSUE_TEMPLATE/*.md` front matter (`name`, `about`, `title`, `labels`, `assignees`, `type`).

## Talks to

- Depends on: GitHub’s issue template feature — [CONFIRMED]
- Depended on by: humans filing bugs (see `ABOUT.md` “Hey I found a bug…”) — [CONFIRMED]
- No CI: no `.github/workflows/` present — [CONFIRMED] directory listing

## Build

N/A — not part of firmware or host build.

## Notable observations

- Rebuild-project ownership (assignee / labels) is baked into template YAML front matter.
- Entire `.github/` is documentation/process config for the host GitHub repo, not on-robot software.

## Open questions

- [UNKNOWN] Whether private or branch-specific Actions exist only on the remote and are not checked in.
