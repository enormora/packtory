import assert from 'node:assert';
import type { RegistryDetails } from '../registry.ts';
import {
    expectedFirstPackageVersion
} from './publish-fixture-expectations.ts';
import {
    assertPublishSucceeded,
    createPackageConfiguration,
    createPackageConfigurationList,
    fetchPublishedPackage,
    publishFixturePackages
} from './publish-fixture-support.ts';

export async function assertFixturePublishResult(
    fixturePath: string,
    registryDetails: RegistryDetails,
    expectedSecondPackageVersion: Readonly<Record<string, unknown>>
): Promise<void> {
    const result = await publishFixturePackages({ fixturePath, registryDetails });
    assertPublishSucceeded(result);

    const latestVersionOfFirstPackage = await fetchPublishedPackage('first', registryDetails);
    const latestVersionOfSecondPackage = await fetchPublishedPackage('second', registryDetails);

    assert.deepStrictEqual(
        {
            version: latestVersionOfFirstPackage.version,
            files: latestVersionOfFirstPackage.files
        },
        expectedFirstPackageVersion
    );
    assert.deepStrictEqual(
        {
            version: latestVersionOfSecondPackage.version,
            files: latestVersionOfSecondPackage.files
        },
        expectedSecondPackageVersion
    );
}

export function softwareBillOfMaterialsPackages(
    fixturePath: string
): ReturnType<typeof createPackageConfigurationList> {
    return createPackageConfigurationList(
        createPackageConfiguration(fixturePath, 'first', 'entry1', {
            publishSettings: { access: 'public', softwareBillOfMaterials: { enabled: true } }
        }),
        createPackageConfiguration(fixturePath, 'second', 'entry2', {
            bundleDependencies: [ 'first' ],
            publishSettings: { access: 'public', softwareBillOfMaterials: { enabled: true } }
        })
    );
}

export type SoftwareBillOfMaterialsMetadata = {
    readonly component: {
        readonly 'bom-ref': string;
        readonly name: string;
        readonly version: string;
    };
};

export function assertFirstPackageSoftwareBillOfMaterials(
    softwareBillOfMaterials: Readonly<Record<string, unknown>>
): void {
    assert.partialDeepStrictEqual(softwareBillOfMaterials, {
        bomFormat: 'CycloneDX',
        specVersion: '1.6'
    });
    const metadata = softwareBillOfMaterials.metadata as SoftwareBillOfMaterialsMetadata;
    assert.strictEqual(metadata.component['bom-ref'], 'pkg:npm/first@0.0.1');
    assert.partialDeepStrictEqual(metadata, {
        component: {
            name: 'first',
            version: '0.0.1'
        }
    });
    assert.deepStrictEqual(softwareBillOfMaterials.components, []);
}
