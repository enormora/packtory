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
- **On-Disk Artifacts for Non-Registry Targets**: Produce a single configured package as a zip, tarball, or expanded folder — ideal for AWS Lambda deployments, container builds, and any workflow where the destination isn't an npm registry.

## Quick Start

The quickest way to leverage packtory is through its command-line interface (CLI).

**Installation:**

```bash
npm install -D @packtory/cli
```

**Configuration:**

Create a configuration file named `packtory.config.js` in your project's root:

Your root `package.json` must declare `"type": "module"`. `packtory` only supports ESM package manifests.

```js
import path from 'node:path';
import fs from 'node:fs';

const npmToken = process.env.NPM_TOKEN;

export const config = {
    // `registrySettings` is only required to publish (non-dry-run). Pack, dry-run publish,
    // release-diff and release analysis read registry metadata anonymously when omitted.
    ...(npmToken === undefined ? {} : { registrySettings: { auth: { type: 'bearer-token', token: npmToken } } }),

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
            roots: { main: { js: 'first.js' } }
        },
        {
            name: 'second-package',
            roots: { main: { js: 'second.js' } },
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

To send the next release to npm's staging area instead of publishing it live:

```bash
npx packtory publish --no-dry-run --stage
```

Staged publishing is npm-only. The package must already exist on npm, and automatic versioning in stage mode must be able to list pending staged versions before it picks the next version.

For more details about the CLI application have a look at the [full documentation](./source/packages/command-line-interface/readme.md).

## Concept

### Bundling

Packtory guarantees minimal packages with:

- No published `devDependencies`
- No unnecessary files, including CI configurations

**How Bundling Works:**

1. All source files referenced from the configured roots are resolved into a graph.
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

### Pack (on-disk artifacts)

`packtory publish` is the registry-driven workflow; `packtory pack` is the disk-driven complement. Use it whenever you need the same bundled, dead-code-eliminated, linked output as a published package, but the destination is something other than an npm registry — AWS Lambda functions, Docker build contexts, OCI image layers, archived release artifacts, or local inspection of what would have been published.

`pack` reuses the same validate → resolve → link → checks pipeline as the other commands. What changes is the emit stage:

- **Format**: `zip` (the format AWS Lambda accepts directly, with deterministic metadata for byte-identical builds), `tar` (the same gzipped tarball shape `publish` would upload), or `folder` (the artifact expanded into a directory).
- **Output path**: where to write the archive or, for `folder`, the directory to populate.
- **Version**: stamped into the generated manifest. Defaults to `0.0.0` — `pack` is intentionally decoupled from the registry-driven automatic versioning, so the caller decides the version (often the CI build's release tag).
- **Vendor dependencies**: an opt-in `--vendor-dependencies` (CLI) / `vendorDependencies: true` (API) flag materializes every transitive runtime dependency from the local `node_modules` directly into `node_modules/` inside the artifact. This is what makes the output self-contained for runtimes that cannot run `npm install` (AWS Lambda, distroless containers). Symlink layouts created by npm, yarn-classic, and pnpm are all handled. Packages declared in `bundleDependencies` are materialized too, with their original cross-package import paths preserved.

```bash
npx packtory pack image-resizer-cli --format zip --out ./dist/image-resizer-cli.zip --vendor-dependencies
```

See the [CLI documentation](./source/packages/command-line-interface/README.md) for the full flag reference and the programmatic API in [`packtory`](./source/packages/packtory/README.md) for `packPackage(config, options)`.

For a deeper look at the pipeline, the package graph, parallel scheduling, the tree-shaking algorithm, import-path rewriting, and automatic version detection, see [How it works under the hood](./documentation/how-it-works.md).

## Configuration

The configuration for `packtory` is an object with the following properties:

1. **`registrySettings`** (Optional):
    - Only required to publish in non-dry-run mode. Pack, dry-run publish, release-diff and release analysis read registry metadata anonymously when `registrySettings` (or its `auth`) is omitted. Non-dry-run publish fails fast with one config error before any package is built when `auth` is missing.
    - `auth` (Optional): the credentials used to read metadata and/or publish.
    - `registryUrl` (Optional): a custom registry URL.
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
    - To keep environment-variable reads lazy, gate `registrySettings` on the env var inside `buildConfig`:
        ```js
        const npmToken = process.env.NPM_TOKEN;
        return {
            ...(npmToken === undefined ? {} : { registrySettings: { auth: { type: 'bearer-token', token: npmToken } } })
            // …
        };
        ```

2. **`commonPackageSettings`** (Optional):
    - Defines settings that can be shared for all packages.
    - Allowed settings: `sourcesFolder`, `mainPackageJson`, `includeSourceMapFiles`, `additionalFiles`, `additionalPackageJsonAttributes`, `publishSettings`.

3. **`checks`** (Optional, Object):
    - Toggles and configures the cross-package checks that run after every bundle has been linked. Lives at the top level (not inside `commonPackageSettings`) because every check operates over the full set of bundles. See [Checks](#checks).

4. **`packages`** (Required, Array):
    - An array of per-package configurations.
    - Each per-package configuration has the following settings:

    - **`name`** (Required, String):
        - Must be unique; the name of the package.

    - **`sourcesFolder`** (Required):
        - The absolute path to the base folder of the source files.
        - All other file paths are resolved relative to this path.

    - **`mainPackageJson`** (Required):
        - The parsed content of the project's `package.json`.
        - It must contain `"type": "module"`.
        - Needed to obtain version numbers of third-party dependencies.

    - **`roots`** (Required, Object):
        - A map of root ids to source files, e.g. `{ main: { js: 'file.js', declarationFile: 'file.d.ts' } }`.
        - `js` is required. `declarationFile` is optional.
        - Roots seed scanning, linking, and dead-code analysis. They are internal build anchors, not automatically the full published API.

    - **`defaultModuleRoot`** (Optional in single-root packages, required in implicit multi-root packages):
        - Selects which root becomes the package root export `"."` when `packageInterface` is not configured.

    - **`packageInterface`** (Optional, Object):
        - Switches packtory into explicit package-surface mode.
        - `modules` declares the published module exports with `{ root, export }`.
        - `bins` declares published executables with `{ root, name }`.
        - If omitted, packtory derives `exports` implicitly from roots and cross-package substitution needs.

    - **`includeSourceMapFiles`** (Optional, Boolean, Default: `false`):
        - If `true`, the bundler will look for and include source map files in the final package.

    - **`additionalFiles`** (Optional, Array of File Descriptions):
        - An array to add additional files to the package that are not automatically resolved.
        - Example: `{ sourceFilePath: 'LICENSE', targetFilePath: 'LICENSE' }`.
        - If defined in both per-package and common settings, they are merged.
        - Code files (`.js`, `.cjs`, `.mjs`, `.jsx`, `.ts`, `.cts`, `.mts`, `.tsx`, `.d.ts`) are rejected: code that ships in the bundle must be reachable from a root so dependency, side-effect and dead-code analyses can run on it. If you need to ship code as a static asset (e.g. a template), give it a non-code extension like `.txt`.

    - **`additionalPackageJsonAttributes`** (Optional, Object):
        - An object to be merged directly into the generated `package.json`.
        - Useful for setting meta properties like `description` or `keywords`.
        - If defined in both per-package and common settings, they are merged.
        - The `scripts` key is rejected by default to prevent accidental shipping of npm lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`, `prepublish`, `prepublishOnly`) — the canonical npm supply-chain attack vector. Set `publishSettings.allowScripts: true` on the resolved publish settings to opt in.
        - `exports`, `bin`, `main`, and top-level `types` are auto-managed by packtory and cannot be set here.

    - **`bundleDependencies`** (Optional, Array of Strings):
        - An array of package names to mark as dependencies, allowing the bundler to substitute import statements accordingly.

    - **`bundlePeerDependencies`** (Optional, Array of Strings):
        - Similar to `bundleDependencies` but represented as `peerDependencies` in the generated `package.json`.

    - **`checks`** (Optional, Object):
        - Per-package contribution to the configured checks. See [Checks](#checks). Each enabled check decides whether per-package overrides apply to it; rules without per-package configuration accept only an empty object for that key.

    - **`publishSettings`** (Required somewhere):
        - Controls how the package is published. Must be set in `commonPackageSettings` (as a default for every package), in every package entry, or both. If neither is set, validation rejects the config with `publishSettings must be set in commonPackageSettings or in every package`.
        - A discriminated union on `access`:
            - `{ access: 'public' }` — publishes the package as public on the registry. Only `'public'` allows provenance.
            - `{ access: 'restricted' }` — publishes the package as restricted (paid feature on npmjs.org for scoped packages). Provenance is not allowed in this mode.
        - When `access: 'public'`, an optional `provenance` field enables sigstore-signed [npm provenance attestations](https://docs.npmjs.com/generating-provenance-statements):
            - `provenance: { type: 'auto' }` — let `libnpmpublish` detect the CI environment and generate the provenance statement. Currently supported CIs: GitHub Actions and GitLab CI.
            - `provenance: { type: 'file', path: './build/pkg.sigstore' }` — pass a pre-generated sigstore bundle. Use this for any CI not natively supported by `auto` mode (e.g. CircleCI, Jenkins, BuildKite). The bundle must have been signed against the exact tarball packtory builds; mismatches are rejected with a clear error.
        - Per-package `publishSettings` replaces the whole common-level block (no field-level merging) so the `access` ↔ `provenance` constraint stays internally consistent at every scope.
        - An optional `allowScripts` boolean is accepted on both branches and is `false` by default. It must be explicitly set to `true` to allow a `scripts` block in `additionalPackageJsonAttributes` to flow into the published `package.json`. This default-off behaviour exists to prevent shipping npm lifecycle scripts — the canonical supply-chain attack vector — and the opt-in lives on `publishSettings` (replace-merged per package) so it cannot be silently inherited from common settings.

**Note**: Per-package settings override or merge with common settings when both are defined.

This comprehensive configuration allows fine-tuning for individual packages and provides flexibility in defining dependencies and additional files.

## Checks

Checks are post-bundling validations that run after every bundle has been linked. They operate over the full set of bundles, so a single rule can flag issues that span multiple packages (e.g. duplicated files). Configuration is split across two scopes:

- **Top-level `checks`** — a sibling of `commonPackageSettings` and `packages`. Toggles each rule via `enabled` and holds any cross-package or default settings the rule needs. A rule cannot be disabled per package.
- **Per-package `checks`** — lives on each `PackageConfig`. Carries that package's contribution to (or override of) a rule's settings. Only rules that document per-package fields accept anything beyond `{}` here.

If `checks` is omitted, every rule is off.

```javascript
checks: {
    areTheTypesWrong: { enabled: true },
    noDuplicatedFiles: { enabled: true },
    requiredFiles: { enabled: true, files: ['LICENSE'] },
    maxBundleSize: { enabled: true, bytes: 500_000 },
    noUnusedBundleDependencies: { enabled: true },
    noDevDependencyImports: { enabled: true },
    uniqueTargetPaths: { enabled: true },
    noSideEffects: { enabled: true }
}
```

### `areTheTypesWrong`

Runs [Are the Types Wrong?](https://arethetypeswrong.github.io/) against the emitted package contents and the generated `package.json`, before publish. This checks the exact public package surface packtory would ship, not the source tree.

- **Top-level:** `enabled: boolean`, `profile?: 'strict' | 'node16' | 'esm-only'`.
- **Per-package:** `profile?: 'strict' | 'node16' | 'esm-only'` — overrides the top-level profile for that package.
- If no profile is set, packtory defaults to `esm-only`. Packtory only emits `type: "module"` packages, so this default ignores ATTW's expected CommonJS-only resolution failures and focuses on the ESM surface that packtory actually supports.

### `noDuplicatedFiles`

Reports any source file that ends up in more than one bundle.

- **Top-level:** `enabled: boolean`, `allowList?: string[]` — files that may appear in any number of bundles unconditionally. Use this for files you intentionally distribute across every package (e.g. a shared `LICENSE` injected via `commonPackageSettings.additionalFiles`).
- **Per-package:** `allowList?: string[]` — files this package consents to share with other packages.

A duplicate is suppressed iff the file is in the top-level `allowList`, **or** every owning bundle's per-package `allowList` contains it. A package that does not list a file (and that file is not globally allow-listed) effectively vetoes any duplicate involving it.

```javascript
// Blanket allow — every bundle may ship the shared LICENSE
checks: { noDuplicatedFiles: { enabled: true, allowList: [path.join(projectFolder, 'LICENSE')] } }
```

```javascript
// Per-package consent — pkg-a and pkg-b agree to share util.ts; nobody else may
checks: { noDuplicatedFiles: { enabled: true } },
packages: [
    {
        name: 'pkg-a',
        roots: { main: { js: 'a.js' } },
        checks: { noDuplicatedFiles: { allowList: ['util.ts'] } }
    },
    {
        name: 'pkg-b',
        roots: { main: { js: 'b.js' } },
        checks: { noDuplicatedFiles: { allowList: ['util.ts'] } }
    }
]
```

### `requiredFiles`

Each bundle must contain every file in the effective list, matched on the bundle's `targetFilePath`.

- **Top-level:** `enabled: boolean`, `files?: string[]` — defaults applied to every package.
- **Per-package:** `files?: string[]` — extends the global list. The effective list is the deduplicated union of both.

```javascript
checks: { requiredFiles: { enabled: true, files: ['LICENSE', 'readme.md'] } }
```

### `maxBundleSize`

Reports any bundle whose resources sum to more than the configured byte limit, measured as UTF-8 byte length.

- **Top-level:** `enabled: boolean`, `bytes?: number` — default threshold for every package.
- **Per-package:** `bytes?: number` — overrides the global default for that package.
- A bundle without any applicable threshold (no global default and no per-package value) is skipped.

```javascript
checks: { maxBundleSize: { enabled: true, bytes: 500_000 } },
packages: [
    {
        name: 'image-resizer-cli',
        roots: { main: { js: 'cli.js' } },
        checks: { maxBundleSize: { bytes: 2_000_000 } }
    }
]
```

### `noUnusedBundleDependencies`

Reports declared `bundleDependencies` and `bundlePeerDependencies` whose imports were never substituted by the linker — i.e. no file in the bundle imports anything from the named package, so the declaration is dead config.

- **Top-level:** `enabled: boolean`.
- **Per-package:** `{}` only.

### `noDevDependencyImports`

Reports any external dependency reachable from a package's source that is declared only in `mainPackageJson.devDependencies` and not in `dependencies` or `peerDependencies`. Catches dev-only deps that have leaked into runtime imports — a likely break for downstream consumers.

- **Top-level:** `enabled: boolean`.
- **Per-package:** `{}` only.
- The effective `mainPackageJson` is resolved per package (per-package overrides `commonPackageSettings`) before the rule runs.

### `uniqueTargetPaths`

Reports any bundle where two resources resolve to the same `targetFilePath`. Typically arises when an `additionalFiles` entry's `targetFilePath` collides with the relative path of an already-resolved local file; without this rule the artifact writer silently overwrites one with the other.

- **Top-level:** `enabled: boolean`.
- **Per-package:** `{}` only.

### `noSideEffects`

Reports any source file in a bundle that has top-level side effects, preventing downstream consumers from tree-shaking it. Side effects are detected purely by static analysis of top-level statements — no `package.json sideEffects` field is consulted. Examples of impure top-level statements that this rule flags: top-level expression statements (`console.log(...)`, IIFEs, `Object.freeze(...)`), top-level `await`, decorated classes, classes with impure static initializers or static blocks, control-flow statements (`if`, `for`, `while`, `try`), and bare imports of asset files (`.css`, `.scss`, `.sass`, `.less`).

- **Top-level:** `enabled: boolean`, `allowList?: string[]` — files whose side effects are intentional and should not be flagged. Use this for legitimate setup modules (polyfills, ambient configuration, CLI entry points).
- **Per-package:** `allowList?: string[]` — files this package consents to ship with side effects.

A side-effecting file is suppressed iff it appears in the top-level `allowList`, **or** in the per-package `allowList` for its bundle.

```javascript
checks: { noSideEffects: { enabled: true, allowList: ['/src/polyfill.ts'] } }
```

The error message names the file and the offending statement(s) by line and kind, so the location is actionable without further investigation. The rule is opt-in by default — many legitimate packages (CLI bins, polyfill libraries) have side effects on purpose.

## Dead-Code Elimination

`packtory` performs symbol-level reachability analysis across every bundled file and removes top-level declarations that nothing reaches. A declaration is reached if it is exported from a public root file, referenced by a top-level side-effect statement, or imported (or re-exported) by another packtory-managed bundle in the same publish run. Files with top-level side effects are preserved untouched.

### What gets removed

Within each bundle, the analyzer:

1. Extracts every top-level binding (functions, classes, variables, types, enums, namespaces, imports) from every code file.
2. Seeds reachability with: every binding exported from any public root file, plus every binding referenced by any impure top-level statement, plus every binding another bundle in the same publish run actually depends on. Once a sibling bundle depends on a public file, packtory keeps the whole public file live, not only the currently imported names.
3. Walks the symbol graph (TypeScript-compiler-backed reference resolution, so shadowing and import aliases resolve correctly) until no new reachable bindings are found.
4. Removes every top-level named declaration whose name is not in the reachable set. For combined `const a = 1, b = 2;` declarations, only the dead declarators are removed; the surviving ones stay in place.

Files whose top-level statements are impure are left fully intact. The static side-effect classifier identifies impure top-level statements: expression statements (`console.log(...)`, IIFEs, `Object.freeze(...)`), top-level `await`, decorated classes, classes with impure static initializers or static blocks, control-flow statements (`if`, `for`, `while`, `try`), variable initializers that contain calls or property accesses, and bare imports of asset extensions (`.css`, `.scss`, `.sass`, `.less`).

### Free side-effect features

The same static analysis also drives, regardless of any `checks` configuration:

1. **Auto-emitted `sideEffects` in the published `package.json`.** When every bundled code file is statically pure, the generated manifest emits `"sideEffects": false`. When some files are impure, the manifest emits `"sideEffects": ["./impure-file.js", ...]` listing only the offending paths, sorted alphabetically. When every file is impure, the field is omitted (the conservative default). A user-provided `sideEffects` in `additionalPackageJsonAttributes` or `mainPackageJson` always wins over the auto-emitted value.
2. **The `noSideEffects` check rule** — opt-in CI enforcement that a package is tree-shakable.

### Configuration

```javascript
{
    name: 'pkg',
    roots: { main: { js: 'index.js' } },
    deadCodeElimination: { enabled: true } // default; set to false to disable transformations
}
```

`deadCodeElimination` may also live in `commonPackageSettings` to apply to every package; per-package values override the common setting. When `enabled: false`, the analyzer still runs (so the auto-emitted `sideEffects` and the `noSideEffects` rule keep working), but no declarations are removed from the package's source files.

### Source maps

When a `.map` file is paired with a code file the analyzer transforms, packtory recomposes the source map so the published map still points back to the original sources at the new line and column numbers. If no `.map` is shipped (because `includeSourceMapFiles` is off, or the toolchain never emitted one), there is nothing to do and recomposition is a no-op. Malformed source maps that cannot be parsed are passed through unchanged rather than dropped.

## Example Use-Cases

### 1. Creating CLI Tools

Suppose you have a project with a utility library (`image-resizer-lib`) and a corresponding CLI tool (`image-resizer-cli`) with bin roots. `packtory` simplifies the bundling and publishing of these packages while ensuring clean and minimal npm packages.

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
            roots: { main: { js: 'lib.js' } }
        },
        {
            name: 'image-resizer-cli',
            roots: { main: { js: 'cli.js' } },
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
            roots: { main: { js: 'index.js' } }
        },
        {
            name: 'awesome-logger-adapter',
            roots: { main: { js: 'adapter.js' } },
            bundleDependencies: ['awesome-logger']
        },
        {
            name: 'awesome-logger-adapter-awesome-target',
            roots: { main: { js: 'target.js' } },
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
        roots: { main: { js: 'cli.js' } }
    },
    {
        name: '@my-org/image-resizer-internal',
        roots: { main: { js: 'internal.js' } },
        publishSettings: { access: 'restricted' }
    }
]
```

### Security & Trust

packtory ships several supply-chain trust features by default and adds opt-in npm provenance attestations on top. First-class GitHub Actions support is built in, with GitLab CI and pre-built sigstore bundles for other environments. See [Supply Chain](./documentation/supply-chain.md) for the full story — what's protecting you out of the box, how to enable provenance, the configurable opt-outs, and what every packtory publish actually produces.

These examples demonstrate how `packtory` adapts to different project structures and facilitates the efficient bundling and publishing of packages with varying dependencies.
