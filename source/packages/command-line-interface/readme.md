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
- **publish:** Bundles and publishes npm packages based on the configuration in `packtory.config.js`.

**Options:**

- **--no-dry-run:** Disables dry-run mode (enabled by default), allowing actual publishing.
- **preview --open:** Generates the same fresh preview report as `packtory preview`, writes a temporary HTML file, and opens it with the platform opener.
- **publish --report-json:** Writes `packtory-report.json`, the machine-readable `BuildReport`.
- **publish --report-html:** Writes `packtory-report.html`, the rich HTML report used by `packtory preview --open`.

**Preview behavior:**

- `packtory preview` always performs a fresh dry-run build. It does not reuse prior report files.
- Previewable runs are shown through `$PAGER` when possible, otherwise `less -R`, otherwise standard output.
- Failure-only runs skip the pager and print diagnostics directly to standard output.
- The terminal preview always carries a visible dry-run label.
- `packtory preview` exits with code `0` on a clean run and `1` on config errors, check failures, or partial failures.
- `packtory preview --open` still exits successfully if report generation worked but opening the file failed; in that case it prints the temporary file path.

**Release-diff behavior:**

- `packtory release-diff` runs the same fresh dry-run build as `preview`, then for each package fetches the tarball of the version currently tagged `latest` on the configured registry and computes the set of file changes between that tarball and the bundle the next run would publish.
- For each package, files are grouped as **Added**, **Removed**, or **Modified**, rendered as a directory tree. Modified files include line-level hunks for textual content (code files, `package.json`, JSON, Markdown, YAML, source maps, and common no-extension license files); other modifications render as `(binary, no text diff)` or as a mode-only change (executable bit flip).
- Packages that have never been published are rendered with a `[first publish]` chip and every bundled file in the **Added** group.
- Packages whose new build is byte-equal to the published version are rendered as a single dim `no changes` line.
- A package that fails earlier in the dry-run build appears in the document `Issues` section rather than as a per-package diff entry.
- Previewable runs are shown through `$PAGER` when possible, otherwise `less -R`, otherwise standard output. Failure-only runs go directly to standard output.
- `packtory release-diff` exits with code `0` on a clean run and `1` on config errors, check failures, or partial failures.
- `release-diff` is read-only: it never publishes and never writes to the registry. It is currently terminal-only; an HTML/`--open` variant and an `--against <version>` selector are not part of this release.

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

**Publish settings:**

Every package needs a `publishSettings` value, either set in `commonPackageSettings` as a default or on each package entry directly. If neither is set, the CLI exits with `publishSettings must be set in commonPackageSettings or in every package`. See the [main configuration docs](../../../readme.md) for the full shape and the access ↔ provenance constraint.

For the full list of publish-time errors and remediation, see [Supply Chain → CLI error reference](../../../documentation/supply-chain.md#cli-error-reference).
