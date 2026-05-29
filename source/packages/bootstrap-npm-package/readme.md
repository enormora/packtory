# @packtory/bootstrap-npm-package

**Claim a brand-new npm package name so a Trusted Publisher can be configured for it**

npm's Trusted Publisher configuration UI is reachable only on the per-package settings page, which means a Trusted Publisher cannot be configured before the package exists on the registry. See [`npm/cli#8544`](https://github.com/npm/cli/issues/8544) for tracking.

This tool publishes a deprecated placeholder `0.0.1` for a brand-new npm name so the per-package settings page becomes reachable. After running it, configure the Trusted Publisher in the npm UI and proceed with normal OIDC-backed publishes for `0.0.2` and later.

## Installation

```bash
npm install -g @packtory/bootstrap-npm-package
```

## Usage

```bash
bootstrap-npm-package <package-name> \
  [--registry-url https://registry.npmjs.org/] \
  [--workaround-url https://github.com/npm/cli/issues/8544] \
  [--dist-tag bootstrap]
```

Example for a brand-new scoped package:

```bash
bootstrap-npm-package @your-scope/new-package
```

The tool will:

1. Build a placeholder tarball containing only a minimal `package.json` and `readme.md` that explains the workaround.
2. Open your browser for the standard npm web login flow and wait for you to complete it (2FA included).
3. Publish version `0.0.1` under the `bootstrap` dist-tag so it never sits on `latest`.
4. Immediately deprecate `0.0.1` with a message pointing at the workaround context.
5. Print the URL for the new package's Trusted Publisher settings page.

After the tool exits, configure the Trusted Publisher in the npm UI, then publish `0.0.2` (and later) from CI via OIDC with full provenance.

## Options

- `<package-name>`: required. The npm name to claim, scoped (e.g. `@scope/foo`) or unscoped.
- `--registry-url`: registry to publish to. Defaults to `https://registry.npmjs.org/`.
- `--workaround-url`: URL embedded in the placeholder's `description`, `readme.md`, and deprecation message. Defaults to the tracking issue.
- `--dist-tag`: dist-tag for the placeholder version. Defaults to `bootstrap`, which keeps `latest` empty until the real `0.0.2` is published.

## What gets published

The tarball contains exactly two files:

- `package/package.json` with the minimal fields `name`, `version`, `description`, `license`.
- `package/readme.md` explaining that the version is a placeholder and pointing at the workaround context.

The published version has no provenance attestation, no SBOM, and no runtime content. It is deprecated in the same invocation so consumers see the warning even if they attempt to install it explicitly.
