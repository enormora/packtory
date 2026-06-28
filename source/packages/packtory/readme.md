### packtory

**API Package for packtory**

This package provides an API for the `packtory` tool, enabling programmatic usage. It exposes the following functions:

- `buildAndPublishAll(config, options)` – validates the configuration, builds every package, runs the enabled checks, and (optionally) publishes the results.
- `resolveAndLinkAll(config)` – performs the validation, resolve, link, and checks phases without publishing. This is useful for custom workflows and integration tests that only need the prepared bundles.
- `diffAgainstLatestPublished(config)` – validates and builds every package without publishing, then per package computes the file-level diff between the bundle the next publish would produce and the version currently tagged `latest` on the configured registry.
- `planReleaseAgainstLatestPublished(config)` – validates and builds every package without publishing, then returns per-package release state, release classification, planned versions, artifact file paths, changed artifact file paths, registry metadata including `gitHead`, current `gitHead`, bundled source file paths, and changelog source file paths.
- `packPackage(config, options)` – validates the configuration, runs the same resolve / link / checks pipeline as `buildAndPublishAll`, and writes a single configured package to disk as a zip, tarball, or expanded folder. Useful when you need an artifact you control (Lambda zip, container build context, local inspection) instead of a registry publish.

**Installation:**

```bash
npm install packtory
```

**Usage:**

```javascript
import { buildAndPublishAll, resolveAndLinkAll, planReleaseAgainstLatestPublished, packPackage } from 'packtory';

const config = {
    /* your packtory configuration */
};

(async () => {
    const publishOutcome = await buildAndPublishAll(config, { dryRun: true, stage: false });
    console.log(publishOutcome.result);

    const resolvedOutcome = await resolveAndLinkAll(config);
    console.log(resolvedOutcome.result);

    const releasePlanOutcome = await planReleaseAgainstLatestPublished(config);
    console.log(releasePlanOutcome.result);

    const packOutcome = await packPackage(config, {
        packageName: 'image-resizer-cli',
        format: 'zip',
        outputPath: './dist/image-resizer-cli.zip',
        version: '1.4.0',
        vendorDependencies: true
    });
    console.log(packOutcome.result);
})();
```

**Parameters:**

- **config:** The packtory configuration object. `registrySettings` is optional; it is only required to publish in non-dry-run mode. Pack, dry-run publish, release-diff and release analysis read registry metadata anonymously when `registrySettings` (or its `auth`) is omitted. Calling `buildAndPublishAll(config, { dryRun: false })` without `auth` fails fast with one `ConfigError` before any package is processed.
- **options:** Per-function options object:
    - `buildAndPublishAll`: `{ dryRun: boolean; stage: boolean; collectReport?: boolean }`.
    - `resolveAndLinkAll`: optional `{ collectReport?: boolean }`.
    - `packPackage`: `{ packageName, format, outputPath, version, vendorDependencies }`. `format` is `'zip' | 'tar' | 'folder'`. `version` stamps the generated manifest (no automatic versioning is performed). `vendorDependencies` toggles materializing the resolved `node_modules` tree (including any `bundleDependencies`) into the artifact for self-contained deployments.

**Return Values:**

- `buildAndPublishAll` returns a `PublishAllOutcome` whose `result` is either a list of successful publish results or a partial error if some packages failed.
  Each successful item includes `publication`, which is `{ type: 'none' }` for dry-runs / already-up-to-date packages, `{ type: 'published' }` for direct publishes, or `{ type: 'staged', stageId }` for npm staged publishing.
- Stage mode is npm-only. The package must already exist on npm, and automatic versioning in stage mode must be able to list pending staged versions before choosing the next version. If publish auth uses npm OIDC/trusted publishing, provide token-based metadata auth for that lookup.
- `resolveAndLinkAll` returns a `ResolveAndLinkAllOutcome` whose `result` carries the resolved package information or details about the failure (validation errors, check failures, or partial execution issues).
- `diffAgainstLatestPublished` returns a `ReleaseDiffAllOutcome` whose `result` carries the per-package release diff list or a failure variant.
- `planReleaseAgainstLatestPublished` returns a `ReleasePlanOutcome` whose `result` carries `{ packages }` or a failure variant. Each package plan includes `previousVersion`, `nextVersion`, `artifactState`, `releaseClassification`, `changed`, `previousGitHead`, `currentGitHead`, `latestRegistryMetadata`, `artifactFiles`, `changedArtifactFiles`, `sourceFiles`, and `changelogSourceFiles`. `releaseClassification` matches the release analysis categories, including `dependency-only` for generated manifest and SBOM dependency changes. `sourceFiles` contains bundled source paths. `changelogSourceFiles` contains repository-relative files for changelog attribution, using readable JavaScript source maps when present. Root `package.json` is included when effective `mainPackageJson` fields affect the generated package manifest, and `additionalChangelogSourceFiles` can add other package attribution paths. `latestRegistryMetadata` includes the previous version, publish time, and previous registry `gitHead` when available.
- `packPackage` returns a `PackOutcome` whose `result` is `Ok(undefined)` on success or a `PackFailure`. `PackFailure` is a discriminated union covering configuration errors, check failures, partial resolve failures, and the pack-specific variants `package-not-found`, `bundle-dependencies-unsupported` (rejected when `vendorDependencies` is `false` and the target declares `bundleDependencies`), and `peer-dependencies-unsatisfied` (raised when a vendored dependency declares a peer that no other vendored package satisfies).

**Note:** Refer to the [full documentation](../../../readme.md) for additional details.
