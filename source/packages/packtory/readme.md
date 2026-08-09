### packtory

Programmatic API for building, checking, publishing, diffing, release planning, and packing configured npm packages.

```bash
npm install packtory
```

```javascript
import {
    buildAndPublishAll,
    diffAgainstLatestPublished,
    packPackage,
    planReleaseAgainstLatestPublished,
    resolveAndLinkAll
} from 'packtory';

const config = {
    /* your packtory configuration */
};

const publishOutcome = await buildAndPublishAll(config, { dryRun: true, stage: false });
const resolvedOutcome = await resolveAndLinkAll(config);
const releaseDiffOutcome = await diffAgainstLatestPublished(config);
const releasePlanOutcome = await planReleaseAgainstLatestPublished(config);
const packOutcome = await packPackage(config, {
    packageName: 'image-resizer-cli',
    format: 'zip',
    outputPath: './dist/image-resizer-cli.zip',
    version: '1.4.0',
    vendorDependencies: true
});

console.log({
    publishOutcome,
    resolvedOutcome,
    releaseDiffOutcome,
    releasePlanOutcome,
    packOutcome
});
```

Exports:

- `buildAndPublishAll(config, options)`: validates the configuration, builds packages, runs checks, and publishes or dry-runs every package.
- `resolveAndLinkAll(config, options?)`: runs validation, resolve, link, dead-code elimination, and checks without publishing.
- `diffAgainstLatestPublished(config)`: builds packages and compares the next artifact against the current `latest` registry version.
- `planReleaseAgainstLatestPublished(config)`: returns per-package release state, planned versions, artifact paths, source attribution, changelog dependency data, and registry metadata.
- `packPackage(config, options)`: writes one package as a zip, tarball, or folder after the same resolve, link, and check pipeline.

`registrySettings` is optional for dry-run publish, release diff, release planning, and pack flows that only need anonymous registry metadata. Non-dry-run publish requires publish auth.

`packPackage` options are `{ packageName, format, outputPath, version, vendorDependencies }`. `format` is `'zip'`, `'tar'`, or `'folder'`; `version` stamps the generated manifest; `vendorDependencies` materializes the resolved `node_modules` tree for self-contained artifacts.

See the full configuration and workflow documentation in the repository readme.
