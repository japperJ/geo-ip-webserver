# Phase H Human Handoff Runbook (Windows)

Use this checklist to clear the remaining **human-only** Phase H blockers: PR/CI/merge evidence for `phase-1 -> main`.

## 1) Confirm clean tree before PR actions

```powershell
git rev-parse --abbrev-ref HEAD
git status --short
```

Expected:
- You are on `phase-1` (or intentionally switching to it before opening PR).
- `git status --short` is empty.

If not clean, resolve by commit/stash/discard, then re-check:

```powershell
git add -A
git commit -m "chore: finalize phase-1 before release PR"
git status --short
```

## 2) Open/confirm PR (`phase-1 -> main`) and capture URL

Open an existing PR or create one:

```powershell
gh pr list --base main --head phase-1 --state open
gh pr create --base main --head phase-1 --title "Phase H: merge phase-1 into main" --body "Release-readiness merge for Phase H"
```

Capture PR URL:

```powershell
gh pr view --json url,number,headRefName,baseRefName
```

Record in `VERIFICATION.md`:
- PR URL
- PR number

## 3) Capture CI links and required checks

Get PR head SHA and recent runs:

```powershell
$sha = gh pr view --json headRefOid --jq .headRefOid
Write-Output "PR head SHA: $sha"
gh run list --branch phase-1 --limit 10
```

Open relevant run details (pick the run for the PR head SHA):

```powershell
gh run view <run-id>
gh run view <run-id> --json url,headSha,status,conclusion,name
```

Confirm and record links for checks:
- `Lint`
- `Test Backend`
- `Test Backend Screenshot Integration`
- `Test Frontend`
- `Build`
- `TypeScript Type Check`

## 4) Merge PR and capture merge evidence

After approvals and green checks:

```powershell
gh pr merge <pr-number> --merge --delete-branch=false
gh pr view <pr-number> --json url,state,mergeCommit,mergedBy
```

Record in `VERIFICATION.md`:
- Approval evidence (reviewer + approval state)
- Merge method (`merge` / `squash` / `rebase`)
- Merge commit SHA

## 5) Post-merge smoke on `main`

```powershell
git checkout main
git pull --ff-only
npm run smoke
```

Record:
- Smoke command result (`exit 0` expected)
- Short summary (HTTP smoke + E2E smoke pass)

## 6) Flip verification to PASS

Update `.planning/phases/H/VERIFICATION.md`:
- Frontmatter: `status: passed`
- Update score (e.g., `10/10`)
- Mark all handoff checklist items complete
- Add PR URL, CI run URL(s), merge SHA, and post-merge smoke evidence

## Final completion checklist

- [ ] Clean tree confirmed
- [ ] PR `phase-1 -> main` URL recorded
- [ ] CI run URL(s) recorded for PR head SHA
- [ ] Required checks confirmed green
- [ ] PR merged; approval + method + merge SHA recorded
- [ ] Post-merge `npm run smoke` on `main` passed
- [ ] `.planning/phases/H/VERIFICATION.md` set to `status: passed`