### packtory

**API Package for packtory**

This package provides an API for the `packtory` tool, enabling programmatic usage. It exposes the following functions:

- `buildAndPublishAll(config, options)` – validates the configuration, builds every package, runs the enabled checks, and (optionally) publishes the results.
- `resolveAndLinkAll(config)` – performs the validation, resolve, link, and checks phases without publishing. This is useful for custom workflows and integration tests that only need the prepared bundles.
- `diffAgainstLatestPublished(config)` – validates and builds every package without publishing, then per package computes the file-level diff between the bundle the next publish would produce and the version currently tagged `latest` on the configured registry.
- `packPackage(config, options)` – validates the configuration, runs the same resolve / link / checks pipeline as `buildAndPublishAll`, and writes a single configured package to disk as a zip, tarball, or expanded folder. Useful when you need an artifact you control (Lambda zip, container build context, local inspection) instead of a registry publish.

**Installation:**

```bash
npm install packtory
```

**Usage:**

```javascript
import { buildAndPublishAll, resolveAndLinkAll, packPackage } from 'packtory';

const config = {
    /* your packtory configuration */
};

(async () => {
    const publishOutcome = await buildAndPublishAll(config, { dryRun: true });
    console.log(publishOutcome.result);

    const resolvedOutcome = await resolveAndLinkAll(config);
    console.log(resolvedOutcome.result);

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

- **config:** The packtory configuration object.
- **options:** Per-function options object:
    - `buildAndPublishAll`: `{ dryRun: boolean; collectReport?: boolean }`.
    - `resolveAndLinkAll`: optional `{ collectReport?: boolean }`.
    - `packPackage`: `{ packageName, format, outputPath, version, vendorDependencies }`. `format` is `'zip' | 'tar' | 'folder'`. `version` stamps the generated manifest (no automatic versioning is performed). `vendorDependencies` toggles materializing the resolved `node_modules` tree (including any `bundleDependencies`) into the artifact for self-contained deployments.

**Return Values:**

- `buildAndPublishAll` returns a `PublishAllOutcome` whose `result` is either a list of successful publish results or a partial error if some packages failed.
- `resolveAndLinkAll` returns a `ResolveAndLinkAllOutcome` whose `result` carries the resolved package information or details about the failure (validation errors, check failures, or partial execution issues).
- `diffAgainstLatestPublished` returns a `ReleaseDiffAllOutcome` whose `result` carries the per-package release diff list or a failure variant.
- `packPackage` returns a `PackOutcome` whose `result` is `Ok(undefined)` on success or a `PackFailure`. `PackFailure` is a discriminated union covering configuration errors, check failures, partial resolve failures, and the pack-specific variants `package-not-found`, `bundle-dependencies-unsupported` (rejected when `vendorDependencies` is `false` and the target declares `bundleDependencies`), and `peer-dependencies-unsatisfied` (raised when a vendored dependency declares a peer that no other vendored package satisfies).

**Note:** Refer to the [full documentation](../../../readme.md) for additional details.
