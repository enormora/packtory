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

-   **publish:** Bundles and publishes npm packages based on the configuration in `packtory.config.js`.

**Options:**

-   **--no-dry-run:** Disables dry-run mode (enabled by default), allowing actual publishing.

**Configuration:**

Create a `packtory.config.js` file in your project to define the configuration. Refer to the [full documentation](https://github.com/enormora/packtory/blob/main/readme.md) for detailed configuration options.
