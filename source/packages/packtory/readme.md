### packtory

Programmatic API for Packtory package builds.

```bash
npm install packtory
```

```javascript
import { buildAndPublishAll, packPackage, resolveAndLinkAll } from 'packtory';

await buildAndPublishAll(config, { dryRun: true, stage: false });
await resolveAndLinkAll(config);
await packPackage(config, {
    packageName: 'pkg',
    format: 'zip',
    outputPath: './dist/pkg.zip',
    version: '1.0.0',
    vendorDependencies: true
});
```

Main exports: `buildAndPublishAll`, `resolveAndLinkAll`, `diffAgainstLatestPublished`, `planReleaseAgainstLatestPublished`, and `packPackage`.

See the repository readme for configuration and workflow documentation.
