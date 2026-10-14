import { Maybe } from 'true-myth';
import { noPublication } from '../bundle-emitter/publication-outcome.ts';
import type { ValidConfigurationResult } from '../configuration/validation.ts';
import type { BuildAndPublishResult } from '../packtory/package-processor.ts';
import type { ResolvedPackage } from '../packtory/resolved-package.ts';
import { analyzedBundle, versionedBundleWithManifest } from './bundle-fixtures.ts';
import {
    packageConfigurationFixture,
    publicPublishSettings,
    validConfigurationFixture
} from './configuration-fixtures.ts';
import { createResolveOptions } from './package-processor-test-support.ts';

export function emptyPublishConfigurationFixture(): ValidConfigurationResult {
    return validConfigurationFixture();
}

export function publishableConfigurationFixture(name: string): ValidConfigurationResult {
    return validConfigurationFixture({
        packages: [ packageConfigurationFixture({ name, publishSettings: publicPublishSettings }) ]
    });
}

export function publishableConfigurationFixtures(packageNames: readonly string[]): ValidConfigurationResult {
    return validConfigurationFixture({
        packages: packageNames.map(function (name) {
            return packageConfigurationFixture({ name, publishSettings: publicPublishSettings });
        })
    });
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
        packageManifest: { name, version }
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
