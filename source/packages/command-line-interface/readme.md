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
