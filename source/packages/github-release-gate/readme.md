# @packtory/github-release-gate

**GitHub Actions release gate for batching publishes without manual approval**

This package evaluates whether a repository is quiet enough to publish from `main`. It is designed for GitHub Actions workflows that want to batch human and bot changes without blocking forever on draft PRs, failing PRs, or long-lived PRs.

## Motivation

A publish workflow usually wants two things that pull in opposite directions:

- avoid spamming releases when several changes land close together
- avoid making a human change wait for a coarse scheduled release window

Publishing on every successful merge solves the second problem, but creates too many releases during bursts of activity. That is especially visible with bot-driven update trains such as Renovate, but it can also happen with a sequence of human PRs landing within a short period.

On the other hand, a simple scheduled release, such as "publish every hour" or "publish every night", solves the release-spam problem by batching everything together, but it also delays legitimate changes even when the repository has already become stable enough to publish.

This tool aims to sit between those extremes. It tries to find a practical balance:

- wait a little while after relevant repository activity so nearby changes can naturally batch together
- do not wait forever if activity keeps happening
- only allow publishing from a `main` commit that has already passed CI
- slow-roll low-signal dependency-only releases without delaying substantive changes the same way

The result is a release gate that is more selective than "publish on every merge", but much more responsive than a coarse scheduled release cadence.

## Detailed Concept

The gate has two layers:

- a GitHub activity gate
- a Packtory release-content policy

The GitHub activity gate is based on two timing signals:

- `quiet period`: how long the repository should stay quiet before a publish is allowed
- `max latency`: how long a green `main` commit may wait before a publish is forced

It then evaluates the current repository state using the following rules:

- Require a successful CI run for the current `main` HEAD.
- Treat pushes to open PR branches as release-relevant activity, including PRs from forks.
- Delay publishing until activity has been stale for a configurable quiet period.
- Force publication once a configurable maximum latency has elapsed since the current `main` HEAD first went green.
- Once the GitHub gate opens, analyze the pending Packtory release against npm `latest`.
- If the release is unchanged, skip publishing.
- If the release is substantive or a first publish, publish immediately.
- If the release is dependency-only, require an additional minimum age since the most recent published package version.

More concretely:

1. Resolve the current `main` HEAD SHA.
2. Look up the latest successful CI run for that exact SHA.
3. Inspect all open PRs targeting the default branch.
4. For each PR, derive its latest relevant branch activity from the PR timeline.
5. Compute the latest relevant activity timestamp across:
   - the successful CI completion time for `main` HEAD
   - all open PR branch activity timestamps
6. Open the GitHub activity gate if either condition is true:
   - the quiet period has elapsed since the latest relevant activity
   - the max latency has elapsed since `main` HEAD first went green
7. Run Packtory release analysis against npm `latest`.
8. Apply the release-content policy:
   - `unchanged`: skip
   - `substantive`: publish
   - `first-publish`: publish
   - `dependency-only`: publish only after `DEPENDENCY_ONLY_MIN_AGE_DAYS`

This means:

- a burst of nearby merges tends to collapse into a single later publish
- active PR pushes keep the gate closed for a while, so more changes can batch together
- a repository that never fully settles will still publish eventually once max latency is reached
- stale draft PRs, failing PRs, or intentionally long-lived PRs do not need special-case state handling, because the signal is branch activity, not PR labels or mergeability
- dependency-only churn can be intentionally delayed without delaying substantive source releases by the same amount

## Decision Outputs

- `should_publish=true|false`
- `reason=ci_not_green|ci_in_progress|activity_not_stale|quiet_period_elapsed|max_latency_elapsed|release_unchanged|dependency_only_min_age_not_elapsed|dependency_only_min_age_elapsed|dependency_only_published_at_unknown`
- `main_head_sha=<sha>`

`ci_not_green` is reserved for the case where the latest push run for `main` HEAD failed or never started; transient gaps during which the run is still executing are reported as `ci_in_progress` so the next gate evaluation can pick the publish back up once CI completes.

When run inside GitHub Actions, the tool writes these values to `$GITHUB_OUTPUT`.

## Installation

```bash
npm install -D @packtory/github-release-gate
```

The package ships a `github-release-gate` executable that writes its decision to `$GITHUB_OUTPUT` when invoked from a GitHub Actions step.

## Usage in a Workflow

```yaml
- name: Install release gate
  run: npm install -D --ignore-scripts @packtory/github-release-gate
- name: Evaluate GitHub release gate
  id: release-gate
  run: npx github-release-gate
  env:
      CI_WORKFLOW_FILE: ci.yml
      DEFAULT_BRANCH: main
      DEPENDENCY_ONLY_MIN_AGE_DAYS: "7"
      GITHUB_TOKEN: ${{ github.token }}
      MAX_LATENCY_HOURS: "24"
      QUIET_PERIOD_MINUTES: "45"
```

## Environment Variables

- `GITHUB_TOKEN` and `GITHUB_REPOSITORY` are required.
- `GITHUB_OUTPUT` is required when used as a GitHub Actions step.
- `CI_WORKFLOW_FILE` defaults to `ci.yml`.
- `DEFAULT_BRANCH` defaults to `main`.
- `GITHUB_API_BASE_URL` defaults to `https://api.github.com`.
- `DEPENDENCY_ONLY_MIN_AGE_DAYS` defaults to `7`.
- `QUIET_PERIOD_MINUTES` defaults to `45`.
- `MAX_LATENCY_HOURS` defaults to `24`.
