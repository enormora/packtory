# @packtory/bootstrap-npm-package

**Claim a brand-new npm package name so a Trusted Publisher can be configured for it**

npm's Trusted Publisher configuration UI is reachable only on the per-package settings page, which means a Trusted Publisher cannot be configured before the package exists on the registry. See [`npm/cli#8544`](https://github.com/npm/cli/issues/8544) for tracking.

This tool publishes a placeholder `0.0.1` for a brand-new npm name on `registry.npmjs.org` so the per-package settings page becomes reachable. The placeholder is marked deprecated in the manifest and shipped under the `bootstrap` dist-tag, so `latest` stays empty until the first real release. After running it, configure the Trusted Publisher in the npm UI and proceed with normal OIDC-backed publishes for `0.0.2` and later.

## Installation

```bash
npm install -g @packtory/bootstrap-npm-package
```

## Usage

```bash
bootstrap-npm-package <package-name>
```

Example for a brand-new scoped package:

```bash
bootstrap-npm-package @your-scope/new-package
```

The tool will:

1. Build a placeholder tarball containing only a minimal `package.json` and `readme.md` that explains the workaround.
2. Open your browser for the standard npm web login flow and wait for you to complete it (2FA included).
3. Publish version `0.0.1` against `registry.npmjs.org` under the `bootstrap` dist-tag so it never sits on `latest`. The manifest carries the deprecation message in the same write, so a separate `npm deprecate` is not needed.
4. Print the URL for the new package's Trusted Publisher settings page.

After the tool exits, configure the Trusted Publisher in the npm UI, then publish `0.0.2` (and later) from CI via OIDC with full provenance.

## Argument

- `<package-name>`: required. The npm name to claim, scoped (e.g. `@scope/foo`) or unscoped.

The registry, the workaround URL embedded in the placeholder, and the placeholder's dist-tag are intentionally not configurable — the tool is single-purpose and targets `registry.npmjs.org`, the `npm/cli#8544` tracking issue, and the `bootstrap` dist-tag.

## What gets published

The tarball contains exactly two files:

- `package/package.json` with the minimal fields `name`, `version`, `description`, `license`, `deprecated`.
- `package/readme.md` explaining that the version is a placeholder and pointing at the workaround context.

The published version has no provenance attestation, no SBOM, and no runtime content. The `deprecated` field is set on publish so consumers see the warning even if they attempt to install it explicitly.
