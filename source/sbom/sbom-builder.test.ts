import assert from 'node:assert';
import * as cdx from '@cyclonedx/cyclonedx-library';
import { suite, test } from 'mocha';
import { buildSbom, type SbomBuilderOptions } from './sbom-builder.ts';
import { createSbomSerializer } from './sbom-serializer.ts';

function serialize(bom: ReturnType<typeof buildSbom>): Record<string, unknown> {
    return JSON.parse(createSbomSerializer().serialize(bom)) as Record<string, unknown>;
}

function buildAndSerialize(options: Partial<SbomBuilderOptions>): Record<string, unknown> {
    return serialize(
        buildSbom({
            toolVersion: '1.2.3',
            rootComponent: { name: 'my-pkg', version: '1.0.0' },
            dependencies: [],
            ...options
        })
    );
}

suite('sbom-builder', function () {
    test('builds an SBOM with root component metadata and no dependencies when there are none', function () {
        const serialized = buildAndSerialize({});

        assert.strictEqual(serialized.bomFormat, 'CycloneDX');
        assert.strictEqual(serialized.specVersion, '1.6');
        assert.deepStrictEqual(serialized.components, []);
        assert.deepStrictEqual(serialized.metadata, {
            tools: {
                components: [ { type: 'application', name: 'packtory', version: '1.2.3' } ]
            },
            component: {
                type: 'library',
                name: 'my-pkg',
                version: '1.0.0',
                'bom-ref': 'pkg:npm/my-pkg@1.0.0',
                purl: 'pkg:npm/my-pkg@1.0.0'
            }
        });
    });

    test('does not emit metadata.timestamp or serialNumber to keep the SBOM reproducible', function () {
        const serialized = buildAndSerialize({});
        const metadata = serialized.metadata as Record<string, unknown>;

        assert.strictEqual(Object.hasOwn(metadata, 'timestamp'), false);
        assert.strictEqual(Object.hasOwn(serialized, 'serialNumber'), false);
    });

    test('adds a runtime dependency with required scope and SPDX expression license', function () {
        const serialized = buildAndSerialize({
            dependencies: [
                {
                    name: 'lodash',
                    specifier: '^4.17.0',
                    scope: cdx.Enums.ComponentScope.Required,
                    license: 'MIT'
                }
            ]
        });

        assert.deepStrictEqual(serialized.components, [
            {
                type: 'library',
                name: 'lodash',
                version: '^4.17.0',
                'bom-ref': 'pkg:npm/lodash@%5E4.17.0',
                scope: 'required',
                licenses: [ { expression: 'MIT' } ],
                purl: 'pkg:npm/lodash@%5E4.17.0'
            }
        ]);
    });

    test('adds a peer dependency with optional scope', function () {
        const serialized = buildAndSerialize({
            dependencies: [
                {
                    name: 'react',
                    specifier: '>=18',
                    scope: cdx.Enums.ComponentScope.Optional,
                    license: 'MIT'
                }
            ]
        });
        const components = serialized.components as readonly Record<string, unknown>[];

        assert.strictEqual(components[0]?.scope, 'optional');
    });

    test('falls back to a named license when the license string is not a valid SPDX expression', function () {
        const serialized = buildAndSerialize({
            dependencies: [
                {
                    name: 'weird',
                    specifier: '1.0.0',
                    scope: cdx.Enums.ComponentScope.Required,
                    license: 'See LICENSE.txt for details'
                }
            ]
        });
        const components = serialized.components as readonly Record<string, unknown>[];

        assert.deepStrictEqual(components[0]?.licenses, [ { license: { name: 'See LICENSE.txt for details' } } ]);
    });

    test('omits the licenses field entirely when no license is known for a dependency', function () {
        const serialized = buildAndSerialize({
            dependencies: [
                {
                    name: 'no-license',
                    specifier: '1.0.0',
                    scope: cdx.Enums.ComponentScope.Required,
                    license: undefined
                }
            ]
        });
        const components = serialized.components as readonly Record<string, unknown>[];

        assert.strictEqual(Object.hasOwn(components[0] ?? {}, 'licenses'), false);
    });

    test('encodes the version specifier inside the purl using URL-encoding', function () {
        const serialized = buildAndSerialize({
            dependencies: [
                {
                    name: 'lodash',
                    specifier: '^4.17.0',
                    scope: cdx.Enums.ComponentScope.Required,
                    license: 'MIT'
                }
            ]
        });
        const components = serialized.components as readonly Record<string, unknown>[];

        assert.strictEqual(components[0]?.purl, 'pkg:npm/lodash@%5E4.17.0');
    });

    test('records every direct dependency under the root component dependency graph', function () {
        const serialized = buildAndSerialize({
            dependencies: [
                {
                    name: 'lodash',
                    specifier: '^4.17.0',
                    scope: cdx.Enums.ComponentScope.Required,
                    license: 'MIT'
                },
                {
                    name: 'react',
                    specifier: '>=18',
                    scope: cdx.Enums.ComponentScope.Optional,
                    license: 'MIT'
                }
            ]
        });
        const dependencies = serialized.dependencies as readonly Record<string, unknown>[];
        const root = dependencies.find(function (entry) {
            return entry.ref === 'pkg:npm/my-pkg@1.0.0';
        });

        assert.deepStrictEqual(root?.dependsOn, [ 'pkg:npm/lodash@%5E4.17.0', 'pkg:npm/react@%3E%3D18' ]);
    });
});
