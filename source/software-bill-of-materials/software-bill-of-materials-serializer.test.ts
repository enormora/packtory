import assert from 'node:assert';
import * as cyclonedx from '@cyclonedx/cyclonedx-library';
import { suite, test } from 'mocha';
import { buildSoftwareBillOfMaterials } from './software-bill-of-materials-builder.ts';
import { createSoftwareBillOfMaterialsSerializer } from './software-bill-of-materials-serializer.ts';

suite('sbom-serializer', function () {
    test('serialize() produces JSON conforming to the CycloneDX 1.6 schema reference', function () {
        const serializer = createSoftwareBillOfMaterialsSerializer();
        const billOfMaterials = buildSoftwareBillOfMaterials({
            toolVersion: '1.2.3',
            rootComponent: { name: 'my-pkg', version: '1.0.0' },
            dependencies: []
        });

        const result = JSON.parse(serializer.serialize(billOfMaterials)) as Record<string, unknown>;

        assert.partialDeepStrictEqual(result, {
            specVersion: '1.6',
            bomFormat: 'CycloneDX'
        });
    });

    test('serialize() yields byte-identical output for the same inputs', function () {
        const serializer = createSoftwareBillOfMaterialsSerializer();
        const buildOptions = {
            toolVersion: '1.2.3',
            rootComponent: { name: 'my-pkg', version: '1.0.0' },
            dependencies: [
                {
                    name: 'lodash',
                    specifier: '^4.17.0',
                    scope: cyclonedx.Enums.ComponentScope.Required,
                    license: 'MIT'
                }
            ]
        };

        const first = serializer.serialize(buildSoftwareBillOfMaterials(buildOptions));
        const second = serializer.serialize(buildSoftwareBillOfMaterials(buildOptions));

        assert.strictEqual(first, second);
    });

    test('serialize() produces dependencies independently of the input order when sortLists is enabled', function () {
        const serializer = createSoftwareBillOfMaterialsSerializer();

        const sortedAscending = serializer.serialize(
            buildSoftwareBillOfMaterials({
                toolVersion: '1.2.3',
                rootComponent: { name: 'my-pkg', version: '1.0.0' },
                dependencies: [
                    {
                        name: 'a-dep',
                        specifier: '1.0.0',
                        scope: cyclonedx.Enums.ComponentScope.Required,
                        license: 'MIT'
                    },
                    {
                        name: 'z-dep',
                        specifier: '1.0.0',
                        scope: cyclonedx.Enums.ComponentScope.Required,
                        license: 'MIT'
                    }
                ]
            })
        );
        const sortedDescending = serializer.serialize(
            buildSoftwareBillOfMaterials({
                toolVersion: '1.2.3',
                rootComponent: { name: 'my-pkg', version: '1.0.0' },
                dependencies: [
                    {
                        name: 'z-dep',
                        specifier: '1.0.0',
                        scope: cyclonedx.Enums.ComponentScope.Required,
                        license: 'MIT'
                    },
                    {
                        name: 'a-dep',
                        specifier: '1.0.0',
                        scope: cyclonedx.Enums.ComponentScope.Required,
                        license: 'MIT'
                    }
                ]
            })
        );

        assert.strictEqual(sortedAscending, sortedDescending);
    });
});
