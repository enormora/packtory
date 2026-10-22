### packtory

Programmatic API for Packtory package builds.

```bash
npm install packtory
```

```javascript
import {
    buildAndPublishAll,
    inspectPackageDependencies,
    inspectPackageFiles,
    inspectPackageSymbols,
    inspectPackageSideEffects,
    packAllPackages,
    packPackage,
    resolveAndLinkAll
} from 'packtory';

await buildAndPublishAll(configuration, { dryRun: true, stage: false });
await resolveAndLinkAll(configuration);
await inspectPackageDependencies(configuration, 'package');
await inspectPackageFiles(configuration, 'package');
await inspectPackageSymbols(configuration, 'package');
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

Main exports: `buildAndPublishAll`, `resolveAndLinkAll`, `diffAgainstLatestPublished`, `planReleaseAgainstLatestPublished`, `inspectPackageDependencies`, `inspectPackageFiles`, `inspectPackageSymbols`, `inspectPackageSideEffects`, `packPackage`, and `packAllPackages`.

`inspectPackageSymbols` returns top-level binding decisions with original linked-source locations and retention chains. It uses configured dead-code elimination settings and sibling consumption without accessing the registry. Use `diffAgainstLatestPublished` for published-tarball comparisons.

See the repository readme for configuration and workflow documentation.
