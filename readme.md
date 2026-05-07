<div align="center">
    <h1>packtory</h1>
    <p><i>Effortless code bundling and publishing for npm packages</i></p>
</div>

🚀 **Simplify and Automate Your Code Bundling and Publishing Workflow with packtory** 🚀

Tired of restrictive monorepo conventions? Fed up with complex workspace setups? Want your monorepo to feel as smooth as a single codebase, effortlessly referencing local files? Think semantic versioning (semver) adds unnecessary complexity, and every version should be treated as potentially breaking anyway? Look no further.

Say goodbye to:

- 🔗 Cumbersome workspaces
- 📦 Dependency linking during development
- 🙅‍♂️ Manual file selection (e.g. via `.npmignore` or `files`)
- 📄 Shipping unnecessary files (e.g. build configs, tests)
- 🔄 Manual versioning

## 🌟 **Introducing packtory: Your Code Organization and Packaging Game Changer** 🌟

**Key Features:**

- **Organize with Freedom**: Manage your monorepo without confining conventions or workspace limitations. packtory simplifies it, just like a single codebase.
- **Effortless Dependency Bundling**: Forget manual dependency linking. packtory automatically detects and bundles dependencies, freeing you to focus on your code.
- **Clean and Efficient Packaging**: Package only essential files, excluding devDependencies, CI configurations, and tests. Keep your npm package clean and efficient.
- **Revolutionary Automatic Versioning**: Choose manual versioning or let packtory handle it. In automatic mode, it calculates versions intelligently, ensuring reproducibility without complexity.
- **Seamless CI Pipeline Integration**: Easily integrate packtory into your CI pipelines for automatic publishing with every commit. No more intricate checks to decide what to publish.

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
    registrySettings: {
        auth: { type: 'bearer-token', token: process.env.NPM_TOKEN }
    },

    // Common settings shared among packages
    commonPackageSettings: {
        sourcesFolder: path.join(process.cwd(), 'dist/'),
        mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' }),
        publishSettings: { access: 'public' }
    },

    // Define your packages
    packages: [
        {
            name: 'first-package',
            entryPoints: [{ js: 'first.js' }]
        },
        {
            name: 'second-package',
            entryPoints: [{ js: 'second.js' }],
            bundleDependencies: ['first-package']
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

- No published `devDependencies`
- No unnecessary files, including CI configurations

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
    - An object with a required `auth` configuration.
    - Optionally, you can provide a custom `registryUrl`.
    - Supported publish auth strategies:
        - `type: 'bearer-token'` with a `token`
        - `type: 'basic'` with `username` and `password`
        - `type: 'npm-oidc'` for npm trusted publishing token exchange
    - `auth` supports two forms:
        - Shorthand: one auth strategy used for both publish and metadata access
        - Expanded: `{ publish, metadata }`
    - Supported metadata modes:
        - `'inherit-publish-auth'`
        - `'anonymous'`
        - `'auto'`
        - explicit bearer/basic auth
    - `packtory` does not read `.npmrc`; provide auth explicitly in `packtory.config.js`.

2. **`commonPackageSettings`** (Optional):
    - Defines settings that can be shared for all packages.
    - Allowed settings: `sourcesFolder`, `mainPackageJson`, `includeSourceMapFiles`, `additionalFiles`, `additionalPackageJsonAttributes`, `publishSettings`.

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

    - **`publishSettings`** (Required somewhere):
        - Controls how the package is published. Must be set in `commonPackageSettings` (as a default for every package), in every package entry, or both. If neither is set, validation rejects the config with `publishSettings must be set in commonPackageSettings or in every package`.
        - A discriminated union on `access`:
            - `{ access: 'public' }` — publishes the package as public on the registry. Only `'public'` allows provenance.
            - `{ access: 'restricted' }` — publishes the package as restricted (paid feature on npmjs.org for scoped packages). Provenance is not allowed in this mode.
        - When `access: 'public'`, an optional `provenance` field enables sigstore-signed [npm provenance attestations](https://docs.npmjs.com/generating-provenance-statements):
            - `provenance: { type: 'auto' }` — let `libnpmpublish` detect the CI environment and generate the provenance statement. Currently supported CIs: GitHub Actions and GitLab CI.
            - `provenance: { type: 'file', path: './build/pkg.sigstore' }` — pass a pre-generated sigstore bundle. Use this for any CI not natively supported by `auto` mode (e.g. CircleCI, Jenkins, BuildKite). The bundle must have been signed against the exact tarball packtory builds; mismatches are rejected with a clear error.
        - Per-package `publishSettings` replaces the whole common-level block (no field-level merging) so the `access` ↔ `provenance` constraint stays internally consistent at every scope.

**Note**: Per-package settings override or merge with common settings when both are defined.

This comprehensive configuration allows fine-tuning for individual packages and provides flexibility in defining dependencies and additional files.

## Example Use-Cases

### 1. Creating CLI Tools

Suppose you have a project with a utility library (`image-resizer-lib`) and a corresponding CLI tool (`image-resizer-cli`) with bin entry points. `packtory` simplifies the bundling and publishing of these packages while ensuring clean and minimal npm packages.

```javascript
// packtory.config.js
export const config = {
    registrySettings: {
        auth: { type: 'bearer-token', token: process.env.NPM_TOKEN }
    },
    commonPackageSettings: {
        sourcesFolder: path.join(process.cwd(), 'dist/'),
        mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' }),
        publishSettings: { access: 'public' }
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
    registrySettings: {
        auth: { type: 'bearer-token', token: process.env.NPM_TOKEN }
    },
    commonPackageSettings: {
        sourcesFolder: path.join(process.cwd(), 'src/'),
        mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' }),
        publishSettings: { access: 'public' }
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

### Auth examples

Use a bearer token:

```javascript
registrySettings: {
    auth: { type: 'bearer-token', token: process.env.NPM_TOKEN }
}
```

Use explicit basic auth for registries such as Azure Artifacts or Artifactory:

```javascript
registrySettings: {
    registryUrl: 'https://registry.example.test/',
    auth: { type: 'basic', username: process.env.NPM_USERNAME, password: process.env.NPM_PASSWORD }
}
```

Use npm trusted publishing / OIDC on npmjs.org:

```javascript
registrySettings: {
    auth: {
        publish: { type: 'npm-oidc', provider: 'auto' },
        metadata: 'auto'
    }
}
```

If the registry challenges a publish with a one-time password, the CLI prompts interactively when running in a TTY. Non-interactive runs should use a token or OIDC flow that does not require a live one-time-password entry.

Use metadata auto mode:

```javascript
registrySettings: {
    auth: {
        publish: { type: 'bearer-token', token: process.env.NPM_TOKEN },
        metadata: 'auto'
    }
}
```

`metadata: 'auto'` means:

- Try metadata requests without authentication first.
- If the registry responds with an authentication challenge such as `401` or `403`, retry using the publish auth.
- Keep in mind that `404` can be ambiguous on some registries because it may mean either "not found" or "not visible without auth".

### Publish settings examples

Set a uniform default for every package in `commonPackageSettings`:

```javascript
commonPackageSettings: {
    sourcesFolder: path.join(process.cwd(), 'dist/'),
    mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' }),
    publishSettings: { access: 'public' }
}
```

Override per package — e.g. a monorepo where the public CLI lives next to a restricted internal helper:

```javascript
commonPackageSettings: {
    sourcesFolder: path.join(process.cwd(), 'dist/'),
    mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' }),
    publishSettings: { access: 'public' }
},
packages: [
    {
        name: 'image-resizer-cli',
        entryPoints: [{ js: 'cli.js' }]
    },
    {
        name: '@my-org/image-resizer-internal',
        entryPoints: [{ js: 'internal.js' }],
        publishSettings: { access: 'restricted' }
    }
]
```

Enable [npm provenance](https://docs.npmjs.com/generating-provenance-statements) automatically when running on GitHub Actions or GitLab CI:

```javascript
commonPackageSettings: {
    sourcesFolder: path.join(process.cwd(), 'dist/'),
    mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' }),
    publishSettings: {
        access: 'public',
        provenance: { type: 'auto' }
    }
}
```

Pre-built provenance bundle (works on any CI):

```javascript
commonPackageSettings: {
    sourcesFolder: path.join(process.cwd(), 'dist/'),
    mainPackageJson: fs.readFileSync('./package.json', { encoding: 'utf8' }),
    publishSettings: {
        access: 'public',
        provenance: {
            type: 'file',
            path: './build/my-package.sigstore'
        }
    }
}
```

When using `provenance: { type: 'auto' }`, your CI workflow needs to expose an OIDC ID token to the publish step. For GitHub Actions, that means granting `id-token: write` on the workflow job:

```yaml
jobs:
    publish:
        runs-on: ubuntu-latest
        permissions:
            id-token: write
            contents: read
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: 24
            - run: npm ci
            - run: npx packtory publish --no-dry-run
```

For GitLab CI, declare an [`id_tokens`](https://docs.gitlab.com/ee/ci/secrets/id_token_authentication.html) entry with audience `sigstore` exposed as `SIGSTORE_ID_TOKEN`:

```yaml
publish:
    image: node:24
    id_tokens:
        SIGSTORE_ID_TOKEN:
            aud: sigstore
    script:
        - npm ci
        - npx packtory publish --no-dry-run
```

Other CIs (CircleCI, Jenkins, BuildKite, etc.) are supported via the `provenance: { type: 'file', path }` escape hatch — generate the sigstore bundle with the attestation tooling of your choice and point packtory at it.

These examples demonstrate how `packtory` adapts to different project structures and facilitates the efficient bundling and publishing of packages with varying dependencies.
