### packtory

Programmatic API for Packtory package builds.

```bash
npm install packtory
```

```javascript
import {
    buildAndPublishAll,
    inspectPackageDependencies,
    inspectPackageSideEffects,
    packAllPackages,
    packPackage,
    resolveAndLinkAll
} from 'packtory';

await buildAndPublishAll(configuration, { dryRun: true, stage: false });
await resolveAndLinkAll(configuration);
await inspectPackageDependencies(configuration, 'package');
await inspectPackageSideEffects(configuration, 'package');
await packPackage(configuration, {
    packageName: 'package',
    format: 'zip',
    outputPath: './dist/package.zip',
    version: '1.0.0',
    vendorDependencies: true
});
await packAllPackages(configuration, {
    outputPath: './dist/packages',
    version: '1.0.0',
    vendorDependencies: false
});
```

Main exports: `buildAndPublishAll`, `resolveAndLinkAll`, `diffAgainstLatestPublished`, `planReleaseAgainstLatestPublished`, `inspectPackageDependencies`, `inspectPackageSideEffects`, `packPackage`, and `packAllPackages`.

See the repository readme for configuration and workflow documentation.
