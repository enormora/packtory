<div align="center">
    <h1>packtory</h1>
    <p><i>Effortless code bundling and publishing for npm packages</i></p>
</div>

🚀 **Simplify and Automate Your Code Bundling and Publishing Workflow with packtory** 🚀

Tired of restrictive monorepo conventions? Fed up with complex workspace setups? Want your monorepo to feel as smooth as a single codebase, effortlessly referencing local files? Think semantic versioning (semver) adds unnecessary complexity, and every version should be treated as potentially breaking anyway? Look no further.

Say goodbye to:

-   🔗 Cumbersome workspaces
-   📦 Dependency linking during development
-   🙅‍♂️ Manual file selection (e.g. via `.npmignore` or `files`)
-   📄 Shipping unnecessary files (e.g. build configs, tests)
-   🔄 Manual versioning

## 🌟 **Introducing packtory: Your Code Organization and Packaging Game Changer** 🌟

**Key Features:**

-   **Organize with Freedom**: Manage your monorepo without confining conventions or workspace limitations. packtory simplifies it, just like a single codebase.
-   **Effortless Dependency Bundling**: Forget manual dependency linking. packtory automatically detects and bundles dependencies, freeing you to focus on your code.
-   **Clean and Efficient Packaging**: Package only essential files, excluding devDependencies, CI configurations, and tests. Keep your npm package clean and efficient.
-   **Revolutionary Automatic Versioning**: Choose manual versioning or let packtory handle it. In automatic mode, it calculates versions intelligently, ensuring reproducibility without complexity.
-   **Seamless CI Pipeline Integration**: Easily integrate packtory into your CI pipelines for automatic publishing with every commit. No more intricate checks to decide what to publish.

## Quick Start

The quickest way to leverage packtory is through its command-line interface (CLI).

**Installation:**

```bash
npm install -D @packtory/cli
```

**Configuration:**

Create a configuration file named `packtory.config.js` in your project's root:

```js
import path from 'node:path';
import fs from 'node:fs';

export const config = {
    // Customize your registry settings, if needed
    registrySettings: { token: process.env.NPM_TOKEN },

    // Common settings shared among packages
    commonPackageSettings: {
        sourcesFolder: path.join(process.cwd(), 'dist/'),
        mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' })
    },

    // Define your packages
    packages: [
        {
            name: 'first-package',
            entryPoints: [ { js: 'first.js' } ],
        },
        {
            name: 'second-package',
            entryPoints: [ { js: 'second.js' } ],
            entryPoints: ,
            bundleDependencies: ['first']
        }
    ]
};
```

**Publishing:**

Execute the following command from the root of your project, no worries it runs in dry-run mode by default:

```
npx packtory publish
```

For more details about the CLI application have a look at the [full documentation](./source/packages/command-line-interface/readme.md).

## Concept

### Bundling

Packtory guarantees minimal packages with:

-   No published `devDependencies`
-   No unnecessary files, including CI configurations

**How Bundling Works:**

1. All source files referenced from the entry point files are resolved into a graph.
2. Imports of `node_modules` and node built-ins are detected and tracked to create a minimal `package.json` later.
3. If bundle dependencies are given, some import statements will be rewritten. For example, if a file in package `first` imports a file in package `second`, the import statement will be rewritten accordingly (e.g., from `import bar from './bar.js'` to `import bar from 'second/bar.js'`).
4. A `package.json` will be generated, and the version numbers of `node_modules` will be taken from the `mainPackageJson` provided in the configuration.

### Publishing

**How Publishing Works:**

Packtory supports two versioning modes:

1. **Automatic Versioning (Default) 🔄:**

    - Fetch the version details of the latest information available from the registry.
    - Download and extract the tarball of the latest version in-memory.
    - Compare the contents of all files from the downloaded tarball with the contents of all files resolved from the bundler:
        - If all files are the same, no new version is needed.
        - If there are any differences, increase the latest version number by one (patch version), generate a new `package.json`, create a tarball, and publish the new version.
    - If no version is available in the registry, an initial version will be built and published with version `0.0.1` (default but can be changed in the configuration).

2. **Manual Versioning:**
    - Provide the exact version number in the configuration.

This explanation provides a comprehensive overview of the bundling and publishing processes in Packtory. Feel free to make any further adjustments or let me know if there's anything specific you'd like to emphasize.

## Configuration

The configuration for `packtory` is an object with the following properties:

1. **`registrySettings`** (Required):

    - An object with at least a required `token` for authentication.
    - Optionally, you can provide a custom `registryUrl` for non-default registries.

2. **`commonPackageSettings`** (Optional):

    - Defines settings that can be shared for all packages.
    - Allowed settings: `sourcesFolder`, `mainPackageJson`, `includeSourceMapFiles`, `additionalFiles`, `additionalPackageJsonAttributes`.

3. **`packages`** (Required, Array):

    - An array of per-package configurations.
    - Each per-package configuration has the following settings:

    - **`name`** (Required, String):

        - Must be unique; the name of the package.

    - **`sourcesFolder`** (Required):

        - The absolute path to the base folder of the source files.
        - All other file paths are resolved relative to this path.

    - **`mainPackageJson`** (Required):

        - The parsed content of the project's `package.json`.
        - Needed to obtain version numbers of third-party dependencies.

    - **`entryPoints`** (Required, Array of Objects):

        - An array of entry points with the following shape: `{ js: 'file.js', declarationFile: 'file.d.ts' }`.
        - The `js` property is required, while `declarationFile` is optional.

    - **`includeSourceMapFiles`** (Optional, Boolean, Default: `false`):

        - If `true`, the bundler will look for and include source map files in the final package.

    - **`additionalFiles`** (Optional, Array of File Descriptions):

        - An array to add additional files to the package that are not automatically resolved.
        - Example: `{ sourceFilePath: 'LICENSE', targetFilePath: 'LICENSE' }`.
        - If defined in both per-package and common settings, they are merged.

    - **`additionalPackageJsonAttributes`** (Optional, Object):

        - An object to be merged directly into the generated `package.json`.
        - Useful for setting meta properties like `description` or `keywords`.
        - If defined in both per-package and common settings, they are merged.

    - **`bundleDependencies`** (Optional, Array of Strings):

        - An array of package names to mark as dependencies, allowing the bundler to substitute import statements accordingly.

    - **`bundlePeerDependencies`** (Optional, Array of Strings):
        - Similar to `bundleDependencies` but represented as `peerDependencies` in the generated `package.json`.

**Note**: Per-package settings override or merge with common settings when both are defined.

This comprehensive configuration allows fine-tuning for individual packages and provides flexibility in defining dependencies and additional files.

## Example Use-Cases

### 1. Creating CLI Tools

Suppose you have a project with a utility library (`image-resizer-lib`) and a corresponding CLI tool (`image-resizer-cli`) with bin entry points. `packtory` simplifies the bundling and publishing of these packages while ensuring clean and minimal npm packages.

```javascript
// packtory.config.js
export const config = {
    registrySettings: { token: process.env.NPM_TOKEN },
    commonPackageSettings: {
        sourcesFolder: path.join(process.cwd(), 'dist/'),
        mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' })
    },
    packages: [
        {
            name: 'image-resizer-lib',
            entryPoints: [{ js: 'lib.js' }]
        },
        {
            name: 'image-resizer-cli',
            entryPoints: [{ js: 'cli.js' }],
            bundleDependencies: ['image-resizer-lib']
        }
    ]
};
```

### 2. Managing Complex Dependencies

Consider a scenario where you have an ecosystem of packages like `awesome-logger`, `awesome-logger-adapter`, and `awesome-logger-adapter-awesome-target`. `packtory` simplifies the bundling and publishing process, automatically managing dependencies between these packages.

```javascript
// packtory.config.js
export const config = {
    registrySettings: { token: process.env.NPM_TOKEN },
    commonPackageSettings: {
        sourcesFolder: path.join(process.cwd(), 'src/'),
        mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' })
    },
    packages: [
        {
            name: 'awesome-logger',
            entryPoints: [{ js: 'index.js' }]
        },
        {
            name: 'awesome-logger-adapter',
            entryPoints: [{ js: 'adapter.js' }],
            bundleDependencies: ['awesome-logger']
        },
        {
            name: 'awesome-logger-adapter-awesome-target',
            entryPoints: [{ js: 'target.js' }],
            bundleDependencies: ['awesome-logger', 'awesome-logger-adapter']
        }
    ]
};
```

These examples demonstrate how `packtory` adapts to different project structures and facilitates the efficient bundling and publishing of packages with varying dependencies.
