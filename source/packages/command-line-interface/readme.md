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

- **publish:** Bundles and publishes npm packages based on the configuration in `packtory.config.js`.

**Options:**

- **--no-dry-run:** Disables dry-run mode (enabled by default), allowing actual publishing.

**Configuration:**

Create a `packtory.config.js` file in your project to define the configuration. Refer to the [full documentation](https://github.com/enormora/packtory/blob/main/readme.md) for detailed configuration options.

**One-time-password support:**

- If the registry challenges a publish with a one-time password, the CLI prompts for it when running in an interactive TTY.
- The prompt times out after 90 seconds.
- Non-interactive runs cannot answer a one-time-password challenge. For CI, prefer an auth method that does not require live one-time-password entry, such as npm trusted publishing / OIDC or a suitable registry token setup.

**Publish settings:**

Every package needs a `publishSettings` value, either set in `commonPackageSettings` as a default or on each package entry directly. If neither is set, the CLI exits with `publishSettings must be set in commonPackageSettings or in every package`. See the [main configuration docs](https://github.com/enormora/packtory/blob/main/readme.md) for the full shape and the access ↔ provenance constraint.

**Common publish-time errors:**

When publishing with `publishSettings.provenance` configured, the CLI surfaces packtory-flavored errors instead of raw `libnpmpublish` messages so you know where to look:

- `Provenance auto mode requires GitHub Actions or GitLab CI. Detected CI: <name>. Use provenance: { type: 'file' } for other environments.` — your CI is not natively supported by `auto` mode; either run from GHA / GitLab CI or switch to `provenance: { type: 'file', path }` and pre-generate the bundle.
- `GitHub Actions provenance needs "permissions: id-token: write" on the workflow job.` — add the `id-token: write` permission to the workflow job that runs `packtory publish`.
- `GitLab CI provenance needs an "id_tokens" entry with audience "sigstore" exposed as SIGSTORE_ID_TOKEN.` — declare the OIDC ID token for the job with audience `sigstore`.
- `Provenance bundle file "<path>" does not exist.` — the file you configured under `provenance.path` was not found. Generate it with your CI's attestation tool before running packtory.
- `Provenance bundle file "<path>" is not a valid sigstore bundle.` — the file is corrupted or was not produced by a supported sigstore client.
- `Provenance bundle at "<path>" was signed against a different tarball than the one packtory built.` — the bundle's signed digest does not match the tarball packtory built. Re-generate the bundle from the current source so it matches.
