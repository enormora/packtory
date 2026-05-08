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
Your root `package.json` must declare `"type": "module"`.

**One-time-password support:**

- If the registry challenges a publish with a one-time password, the CLI prompts for it when running in an interactive TTY.
- The prompt times out after 90 seconds.
- Non-interactive runs cannot answer a one-time-password challenge. For CI, prefer an auth method that does not require live one-time-password entry, such as npm trusted publishing / OIDC or a suitable registry token setup.

**Publish settings:**

Every package needs a `publishSettings` value, either set in `commonPackageSettings` as a default or on each package entry directly. If neither is set, the CLI exits with `publishSettings must be set in commonPackageSettings or in every package`. See the [main configuration docs](https://github.com/enormora/packtory/blob/main/readme.md) for the full shape and the access ↔ provenance constraint.

For the full list of publish-time errors and remediation, see [Supply Chain → CLI error reference](https://github.com/enormora/packtory/blob/main/documentation/supply-chain.md#cli-error-reference).
