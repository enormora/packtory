# @packtory/cli

**Command-Line Interface for packtory**

This package provides a command-line interface (CLI) for the packtory tool, simplifying the process of bundling and publishing npm packages. It allows you to execute common tasks easily through the command line.

**Installation:**

```bash
npm install -D @packtory/cli
```

**Usage:**

```bash
packtory <command> [options]
```

**Commands:**

- **preview:** Runs a fresh dry-run build with report collection enabled and shows a human-oriented preview of the emitted package contents, file statuses, and changed-file diffs.
- **release-diff:** Runs the same dry-run build as `preview` and shows, per package, the changes between the latest version currently published on the configured registry and the bundle the next run would publish.
- **changelog:** Builds the next release plan, attributes merged GitHub pull requests to changed packages, and prints grouped Markdown changelog output.
- **release:** Prints the next release plan by default, or runs one explicit release workflow when action flags and `--no-dry-run` are set.
- **release-pr:** Maintains, validates, and authorizes a reviewed release PR flow for generated changelog releases.
- **publish:** Bundles and publishes npm packages based on the configuration in `packtory.config.js`.
- **pack:** Builds a single configured package and writes it to disk as a zip archive, tarball, or expanded folder. Intended for ad-hoc artifact use cases such as AWS Lambda deployments, container builds, or local inspection. `pack` never talks to a registry.

**Options:**

- **--no-dry-run:** Disables dry-run mode (enabled by default), allowing actual publishing. The CLI fails fast with a single config error when `registrySettings.auth` is missing in this mode; dry-run, `preview`, `release-diff` and `pack` work without `auth` against any registry that allows anonymous metadata reads.
- **preview --open:** Generates the same fresh preview report as `packtory preview`, writes a temporary HTML file, and opens it with the platform opener.
- **publish --report-json:** Writes `packtory-report.json`, the machine-readable `BuildReport`.
- **publish --report-html:** Writes `packtory-report.html`, the rich HTML report used by `packtory preview --open`.
- **publish --stage:** Uses npm staged publishing instead of a direct publish. Successful runs print the npm `stageId` per package. Approval still happens later via `npm stage approve <stage-id>` or npmjs.com. Stage mode is npm-only, and the package must already exist on npm.
- **release --write-changelog:** Writes configured changelog file outputs for packages in the release plan.
- **release --commit:** Commits written changelog files. Requires `--write-changelog`.
- **release --publish:** Publishes changed packages directly to npm. Staged publishing is not used by `release`.
- **release --tag:** Creates one annotated tag per released package, named `{packageName}@{version}`.
- **release --push:** Runs `git push --follow-tags`. Requires `--commit` or `--tag`.
- **release --github-release:** Creates one GitHub Release per package tag. Requires `--tag --push`.
- **release-pr maintain --no-dry-run:** Writes and commits configured changelogs, creates a GitHub-signed commit on the configured release branch, and creates or updates the release PR.
- **release-pr validate:** Validates the current GitHub `pull_request` or `merge_group` event against the release PR policy.
- **release-pr authorize-publish:** Writes `should_publish` and publish target outputs for a workflow that should publish only after a valid release PR merge.
- **release-pr authorize-publish --release-pull-request &lt;number&gt;:** Authorizes a manual retry from a merged release PR.
- **pack &lt;package&gt; --format &lt;zip|tar|folder&gt; --out &lt;path&gt;:** Selects which package from the configuration to build and where to write it. `--format` and `--out` are required.
- **pack --version &lt;version&gt;:** Stamps the produced manifest with the given version. Defaults to `0.0.0` when omitted, since `pack` is decoupled from the registry-driven automatic versioning used by `publish`.
- **pack --vendor-dependencies:** Resolves every external (and bundle) dependency from the local `node_modules` and materializes them next to the package files inside the artifact. Use this for self-contained deployments where the runtime cannot run `npm install` (e.g. AWS Lambda zips). Without the flag, dependencies are recorded in the generated `package.json` only.

**Preview behavior:**

![packtory preview showing per-package file trees and change chips for a 5-package monorepo](../../../documentation/preview-example.gif)

- `packtory preview` always performs a fresh dry-run build. It does not reuse prior report files.
- Previewable runs are shown through `$PAGER` when possible, otherwise `less -R`, otherwise standard output.
- Failure-only runs skip the pager and print diagnostics directly to standard output.
- The terminal preview always carries a visible dry-run label.
- `packtory preview` exits with code `0` on a clean run and `1` on config errors, check failures, or partial failures.
- `packtory preview --open` still exits successfully if report generation worked but opening the file failed; in that case it prints the temporary file path.

**Release-diff behavior:**

![packtory release-diff showing per-file hunks between the published latest and the next bundle](../../../documentation/release-diff-example.gif)

- `packtory release-diff` runs the same fresh dry-run build as `preview`, then for each package fetches the tarball of the version currently tagged `latest` on the configured registry and computes the set of file changes between that tarball and the bundle the next run would publish.
- For each package, files are grouped as **Added**, **Removed**, or **Modified**, rendered as a directory tree. Modified files include line-level hunks for textual content (code files, `package.json`, JSON, Markdown, YAML, source maps, and common no-extension license files); other modifications render as `(binary, no text diff)` or as a mode-only change (executable bit flip).
- Packages that have never been published are rendered with a `[first publish]` chip and every bundled file in the **Added** group.
- Packages whose new build is byte-equal to the published version are rendered as a single dim `no changes` line.
- A package that fails earlier in the dry-run build appears in the document `Issues` section rather than as a per-package diff entry.
- Previewable runs are shown through `$PAGER` when possible, otherwise `less -R`, otherwise standard output. Failure-only runs go directly to standard output.
- `packtory release-diff` exits with code `0` on a clean run and `1` on config errors, check failures, or partial failures.
- `release-diff` is read-only: it never publishes and never writes to the registry. It is currently terminal-only; an HTML/`--open` variant and an `--against <version>` selector are not part of this release.

**Changelog behavior:**

- `packtory changelog` computes the same release plan used by Packtory's release planning API and skips unchanged packages.
- Without `changelog.outputs`, it prints one grouped Markdown changelog for packages that would publish a changed artifact.
- `changelog.outputs` can write a grouped repository file with `{ kind: 'repository-file', path }`, write package-specific files below each changed package's effective `sourcesFolder` with `{ kind: 'package-file', path }`, write package-specific files to explicit repository-relative paths with `{ kind: 'package-file', paths }`, and print grouped release-body Markdown with `{ kind: 'github-release' }`.
- `changelog.prLog` passes changelog behavior into `@pr-log/core`, including `validLabels`, `ignoredLabels`, `versionBumps`, `dateFormat`, `collapseRules`, label lookup interval, and rate-limit retry count. `changelog.targetScopedLabelPattern` customizes package-specific labels and must contain `{targetName}` and `{label}`.
- `changelog.packageTagFormat` customizes package tag lookup for changelog base refs. `changelog.explicitBaseRef` uses one fixed base ref instead.
- Pull requests are attributed by comparing GitHub changed files against each package's attributed source files. Changelog files named `CHANGELOG.md` and configured generated changelog output paths are ignored as attribution inputs.
- JavaScript files are attributed through referenced source maps when they have a `sourceMappingURL`. Without that reference, the JavaScript file itself is attributed.
- The GitHub repository is read from the root `package.json` `repository` field.
- GitHub API requests use `GH_TOKEN` when set, otherwise `GITHUB_TOKEN`.
- Pager output is shown through `$PAGER` when possible, otherwise `less -R`, otherwise standard output.
- Generated changelog files are not automatically added to package artifacts. Use `additionalFiles` when a package artifact should include a changelog.
- `packtory changelog` exits with code `0` on a clean run and `1` on config, release-plan, Git, GitHub, or changelog generation failures. Partial release-plan failures still render succeeded changed packages when changelog generation succeeds.
- `changelog` never commits, tags, creates releases, creates deployments, writes registry data, or publishes packages.

**Release behavior:**

- `packtory release` prints the computed release plan and exits without writing.
- Any action flag requires `--no-dry-run`.
- Invalid combinations fail before writing: `--commit` requires `--write-changelog`; `--write-changelog --publish` requires `--commit`; `--push` requires `--commit` or `--tag`; `--github-release` requires `--tag --push`.
- `--tag` requires `--publish` in the same run unless the registry latest `gitHead` already matches the current Git head. This allows retrying tag and GitHub Release creation after a publish succeeded.
- Non-dry-run release writes require a clean Git index and worktree before the first write.
- The write order is changelog files, commit, final release-plan recomputation, direct npm publish, annotated tags, `git push --follow-tags`, then GitHub Releases.
- Existing package tags at the current head are accepted. Existing tags at another head fail.
- Existing GitHub Releases for verified package tags are accepted and their notes are not rewritten.
- GitHub Release creation requires non-empty release notes. Retry runs recover notes from configured package changelog outputs when npm already has the package version for the current Git head.
- Packtory uses inherited Git configuration, environment, and credentials. In CI, configure commit identity with standard variables such as `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME`, and `GIT_COMMITTER_EMAIL`, and configure push credentials outside Packtory.
- GitHub Release creation reads `GH_TOKEN` first, then `GITHUB_TOKEN`.

**Release PR behavior:**

- `release-pr maintain --no-dry-run` runs the changelog commit part of `packtory release`, creates a GitHub-signed commit on `releasePullRequest.branch` with the GitHub API, creates or updates the release PR, and replaces its labels with `releasePullRequest.label`.
- Release PR commits are authored through the GitHub credential from `GH_TOKEN` or `GITHUB_TOKEN`, so GitHub can mark them verified when the credential supports signed API commits. This allows release PRs to merge into branches that require signed commits without local Git signing setup.
- If release planning produces no changelog commit, `maintain` closes the open release PR for that branch and deletes the remote release branch.
- Release PR settings live in top-level `releasePullRequest`. Defaults are `branch: 'release/packtory'`, `label: 'release'`, `title: 'Prepare release'`, `commitSubject: 'Release packages'`, `defaultBranch: 'main'`, and `automationAuthor: 'github-actions[bot]'`.
- The release PR policy derives allowed files from `changelog.outputs`. Repository and package changelog files are allowed. GitHub Release outputs are ignored because they do not write repository files.
- `release-pr validate` accepts normal PRs without a release label. Release-labeled PRs must match the configured branch, title, author, commit subject, base head, and allowed files. Merge groups must not batch release PRs with other PRs.
- `release-pr authorize-publish` writes GitHub step outputs when `$GITHUB_OUTPUT` exists, otherwise it prints them. Normal commits get `should_publish=false`. A merged valid release PR gets `should_publish=true`, `publish_commit_sha`, `release_commit_sha`, and `release_pull_request_number`.
- Set `releasePullRequest.githubActionsCi` only for the GitHub Actions `GITHUB_TOKEN` workaround. With `trigger: 'workflow-dispatch'`, `workflowFile`, and `requiredStatusContexts`, `maintain` dispatches CI for the release branch, waits for the exact release commit run, and mirrors the configured job names as commit statuses.
- Leave `githubActionsCi` unset when the release branch update already triggers normal CI, such as with a GitHub App token, PAT, human update, external automation, or non-GitHub CI.

**Pack behavior:**

- `packtory pack` runs the same validate → resolve → link → checks pipeline as the other commands, then emits the selected package's bundle to the path given by `--out`. It never reads from or writes to the configured registry.
- Format choices:
  - `zip`: single-file zip archive. The format AWS Lambda accepts directly. Uses static metadata (1980-01-01 entries, deterministic ordering) so byte-identical inputs yield byte-identical archives.
  - `tar`: single-file gzipped tarball, the same shape `publish` would upload, but written to disk instead of the registry.
  - `folder`: expanded directory; `--out` is treated as the directory path. Useful for inspecting the artifact, for `docker build` contexts, or for piping the contents through another tool.
- `--vendor-dependencies` walks the local `node_modules` (resolving symlinks with `fs.realpath`, so npm, yarn-classic, and pnpm layouts all work) and copies every transitive runtime dependency into `node_modules/` inside the artifact. Files are streamed by path rather than read into memory, so binary assets and executables survive intact. Anything declared in `bundleDependencies` is materialized the same way without import-path rewriting, so cross-package imports keep their original form.
- Strict peer-dependency check: when `--vendor-dependencies` is set, every `peerDependency` declared by a vendored package must be satisfied by another vendored package (or by the target package itself). An unsatisfied peer is reported as `peer-dependencies-unsatisfied` and pack exits with code 1.
- Without `--vendor-dependencies`, packages that declare `bundleDependencies` are rejected with `bundle-dependencies-unsupported`. The flag is the only path that knows how to put a sibling package inside the artifact.
- An unknown `<package>` argument is reported as `package-not-found`.

**Preview vs release-diff:**

- **What question does each answer?** `preview` answers _"what would the next publish actually bundle, and what did packtory's linker/DCE change about my source on the way?"_. `release-diff` answers _"what's in this release that wasn't in the previously published one?"_.
- **What is each comparing?** Both run the same fresh dry-run build. `preview` diffs **source on disk** against the **linker/DCE-processed artifacts**. `release-diff` diffs the **latest tarball on the registry** against the **bundle that next run would publish**.
- A careful release flow runs both: `preview` to validate that the bundle is what you intended to build, `release-diff` to validate that the change set against the last release is what you intended to ship.

**Report outputs:**

- `--report-json` keeps the durable structured `BuildReport` contract.
- `--report-html` and `preview --open` render the same human-facing HTML document.
- The HTML report can still be written for failing runs when report data is available.

**Configuration:**

Create a `packtory.config.js` file in your project to define the configuration. Refer to the [full documentation](../../../readme.md) for detailed configuration options.
Your root `package.json` must declare `"type": "module"`.

**One-time-password support:**

- If the registry challenges a publish with a one-time password, the CLI prompts for it when running in an interactive TTY.
- The prompt times out after 90 seconds.
- Non-interactive runs cannot answer a one-time-password challenge. For CI, prefer an auth method that does not require live one-time-password entry, such as npm trusted publishing / OIDC or a suitable registry token setup.
- npm staged publishing (`publish --stage`) can use the same write auth as a normal publish, including npm OIDC/trusted publishing. Approving or rejecting a staged package still happens outside packtory.
- Automatic versioning in npm stage mode also inspects pending staged versions. If publish auth uses npm OIDC/trusted publishing, configure token-based metadata auth too so packtory can perform that lookup.

**Publish settings:**

Every package needs a `publishSettings` value, either set in `commonPackageSettings` as a default or on each package entry directly. If neither is set, the CLI exits with `publishSettings must be set in commonPackageSettings or in every package`. See the [main configuration docs](../../../readme.md) for the full shape and the access ↔ provenance constraint.

For the full list of publish-time errors and remediation, see [Supply Chain → CLI error reference](../../../documentation/supply-chain.md#cli-error-reference).
