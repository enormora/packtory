import { Maybe } from 'true-myth';
import { noPublication } from '../bundle-emitter/publication-outcome.ts';
import type { ValidConfigResult } from '../config/validation.ts';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { ResolvedPackage } from '../packtory/resolved-package.ts';
import { analyzedBundle, versionedBundleWithManifest } from './bundle-fixtures.ts';
import { packageConfigFixture, publicPublishSettings, validConfigFixture } from './config-fixtures.ts';
import { createResolveOptions } from './package-processor-test-support.ts';

export function emptyPublishConfigFixture(): ValidConfigResult {
    return validConfigFixture();
}

export function publishableConfigFixture(name: string): ValidConfigResult {
    return validConfigFixture({ packages: [ packageConfigFixture({ name, publishSettings: publicPublishSettings }) ] });
}

export function resolvedPublishPackageFixture(name: string): ResolvedPackage {
    return {
        name,
        analyzedBundle: analyzedBundle({ name }),
        resolveOptions: createResolveOptions()
    };
}

export function versionedPublishBundleFixture(name: string, version: string): BuildAndPublishResult['bundle'] {
    return {
        ...versionedBundleWithManifest({ name, version }),
        packageJson: { name, version }
    };
}

export function buildAndPublishResultFixture(bundle: BuildAndPublishResult['bundle']): BuildAndPublishResult {
    return {
        bundle,
        status: 'new-version',
        publication: noPublication,
        extraFiles: [],
        previousReleaseArtifacts: Maybe.nothing()
    };
}
