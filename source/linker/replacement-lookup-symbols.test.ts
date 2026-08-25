import assert from 'node:assert';
import { suite as describe, test as it } from 'mocha';
import { explicitPackageSurface } from '../package-surface/surface.ts';
import {
    analyzedBundleResource as bundleResourceFixture,
    linkedBundle as linkedBundleFixture
} from '../test-libraries/bundle-fixtures.ts';
import type { BundleSubstitutionSource } from './linked-bundle.ts';
import { findAllPathReplacements, type ImportPathReplacementRequest } from './replacement-lookup.ts';

function rootFile(sourceFilePath: string, targetFilePath: string): BundleSubstitutionSource['roots'][string]['js'] {
    return {
        content: '',
        isExecutable: false,
        sourceFilePath,
        targetFilePath
    };
}

function entryRoot(): BundleSubstitutionSource['roots'][string] {
    return {
        js: rootFile('/b/entry.js', 'entry.js'),
        declarationFile: rootFile('/b/entry.d.ts', 'entry.d.ts')
    };
}

type TestResource = {
    readonly sourceFilePath: string;
    readonly targetFilePath: string;
    readonly content: string;
};

function testResource(sourceFilePath: string, targetFilePath: string, content: string): TestResource {
    return { sourceFilePath, targetFilePath, content };
}

function peerBundle(resources: readonly TestResource[]): BundleSubstitutionSource {
    return linkedBundleFixture({
        name: 'pkg-b',
        contents: resources.map(function (resource) {
            return bundleResourceFixture(resource.sourceFilePath, {
                targetFilePath: resource.targetFilePath,
                content: resource.content
            });
        }),
        roots: { main: entryRoot() },
        surface: explicitPackageSurface({ modules: [ { root: 'main', export: './entry.js' } ] })
    });
}

function peerEntryBundle(entryContent: string): BundleSubstitutionSource {
    return peerBundle([
        testResource('/b/entry.d.ts', 'entry.d.ts', entryContent),
        testResource('/b/internal.d.ts', 'internal.d.ts', '')
    ]);
}

function request(
    sourceFilePath: string,
    requiredExportNames: readonly string[],
    requiresNamespaceExport: boolean
): ImportPathReplacementRequest {
    return {
        sourceFilePath,
        requiredExportNames: new Set(requiredExportNames),
        requiresNamespaceExport
    };
}

function namedRequest(sourceFilePath: string, requiredExportNames: readonly string[]): ImportPathReplacementRequest {
    return request(sourceFilePath, requiredExportNames, false);
}

function namespaceRequest(sourceFilePath: string): ImportPathReplacementRequest {
    return request(sourceFilePath, [], true);
}

function assertReplacement(requests: readonly ImportPathReplacementRequest[], bundle: BundleSubstitutionSource): void {
    const result = findAllPathReplacements(requests, [], [ bundle ]);

    assert.deepStrictEqual(
        result.importPathReplacements.get('/b/internal.d.ts') ?? result.importPathReplacements.get('/b/internal.js'),
        { emittedSpecifier: 'pkg-b/entry.js', packageName: 'pkg-b' }
    );
}

function assertRejected(requests: readonly ImportPathReplacementRequest[], bundle: BundleSubstitutionSource): void {
    assert.throws(function () {
        findAllPathReplacements(requests, [], [ bundle ]);
    }, /^Error: Package "pkg-b" does not expose "\/b\/internal\.(?:d\.ts|js)" for cross-package substitution$/u);
}

describe('replacement-lookup symbol reachability', function () {
    describe('accepted replacements', function () {
        it('accepts a peer rewrite when the requested symbol is exported', function () {
            assertReplacement(
                [ namedRequest('/b/internal.d.ts', [ 'Public' ]) ],
                peerEntryBundle('export type { Public } from "./internal.js";\n')
            );
        });

        it('accepts default exports', function () {
            const bundle = peerBundle([
                testResource('/b/entry.d.ts', 'entry.d.ts', 'export { default } from "./internal.js";\n'),
                testResource('/b/internal.js', 'internal.js', '')
            ]);

            assertReplacement([ namedRequest('/b/internal.js', [ 'default' ]) ], bundle);
        });

        it('accepts namespace imports through export stars', function () {
            assertReplacement(
                [ namespaceRequest('/b/internal.d.ts') ],
                peerEntryBundle('export * from "./internal.js";\n')
            );
        });

        it('accepts named imports through export stars', function () {
            assertReplacement(
                [ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ],
                peerEntryBundle('export * from "./internal.js";\n')
            );
        });

        it('accepts named imports through export stars with declaration companions', function () {
            const bundle = peerBundle([
                testResource('/b/entry.d.ts', 'entry.d.ts', 'export * from "./internal.js";\n'),
                testResource('/b/internal.js', 'internal.js', ''),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertReplacement([ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ], bundle);
        });

        it('accepts named imports through the first matching export declaration', function () {
            const bundle = peerBundle([
                testResource(
                    '/b/entry.d.ts',
                    'entry.d.ts',
                    'export type { Other } from "./other.js";\nexport type { Internal } from "./internal.js";\n'
                ),
                testResource('/b/other.d.ts', 'other.d.ts', ''),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertReplacement([ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ], bundle);
        });

        it('accepts named imports through declaration companions', function () {
            const bundle = peerBundle([
                testResource('/b/entry.d.ts', 'entry.d.ts', 'export type { Internal } from "./internal.js";\n'),
                testResource('/b/internal.js', 'internal.js', ''),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertReplacement([ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ], bundle);
        });

        describe('alias chains', function () {
            it('accepts alias chains that preserve the public requested name', function () {
                const bundle = peerBundle([
                    testResource(
                        '/b/entry.d.ts',
                        'entry.d.ts',
                        'export type { Public as Private } from "./middle.js";\n'
                    ),
                    testResource(
                        '/b/middle.d.ts',
                        'middle.d.ts',
                        'export type { Private as Public } from "./internal.js";\n'
                    ),
                    testResource('/b/internal.d.ts', 'internal.d.ts', '')
                ]);

                assertReplacement([ namedRequest('/b/internal.d.ts', [ 'Private' ]) ], bundle);
            });

            it('accepts alias chains that revisit a file under a different export name', function () {
                const bundle = peerBundle([
                    testResource(
                        '/b/entry.d.ts',
                        'entry.d.ts',
                        'export type { Public as Private } from "./middle.js";\n'
                    ),
                    testResource(
                        '/b/middle.d.ts',
                        'middle.d.ts',
                        [
                            'export type { Internal as Public } from "./middle.js";',
                            'export type { Internal } from "./internal.js";'
                        ]
                            .join('\n')
                    ),
                    testResource('/b/internal.d.ts', 'internal.d.ts', '')
                ]);

                assertReplacement([ namedRequest('/b/internal.d.ts', [ 'Private' ]) ], bundle);
            });
        });

        it('accepts namespace imports through export stars with declaration companions', function () {
            const bundle = peerBundle([
                testResource('/b/entry.d.ts', 'entry.d.ts', 'export * from "./internal.js";\n'),
                testResource('/b/internal.js', 'internal.js', ''),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertReplacement([ namespaceRequest('/b/internal.d.ts') ], bundle);
        });

        it('accepts namespace imports through the first matching export declaration', function () {
            const bundle = peerBundle([
                testResource(
                    '/b/entry.d.ts',
                    'entry.d.ts',
                    'export type { Other } from "./other.js";\nexport * from "./internal.js";\n'
                ),
                testResource('/b/other.d.ts', 'other.d.ts', ''),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertReplacement([ namespaceRequest('/b/internal.d.ts') ], bundle);
        });
    });

    describe('rejected replacements', function () {
        it('rejects a peer rewrite when the requested symbol is not exported', function () {
            assertRejected(
                [ namedRequest('/b/internal.d.ts', [ 'Private' ]) ],
                peerEntryBundle('export type { Public } from "./internal.js";\n')
            );
        });

        it('rejects peer internals when only an alias is exported', function () {
            assertRejected(
                [ namedRequest('/b/internal.d.ts', [ 'Private' ]) ],
                peerEntryBundle('export type { Private as Public } from "./internal.js";\n')
            );
        });

        it('rejects namespace imports without export star reachability', function () {
            assertRejected(
                [ namespaceRequest('/b/internal.d.ts') ],
                peerEntryBundle('export type { Internal } from "./internal.js";\n')
            );
        });

        it('rejects default imports through export stars', function () {
            assertRejected(
                [ namedRequest('/b/internal.d.ts', [ 'default' ]) ],
                peerEntryBundle('export * from "./internal.js";\n')
            );
        });

        it('rejects named imports through namespace exports', function () {
            assertRejected(
                [ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ],
                peerEntryBundle('export * as internal from "./internal.js";\n')
            );
        });

        it('rejects symbols reached only by non-relative re-exports', function () {
            const entryContent = [
                'export * as visible from "./internal.js";',
                'export type { Internal } from "internal.d.ts";'
            ]
                .join('\n');

            assertRejected(
                [ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ],
                peerEntryBundle(entryContent)
            );
        });

        it('rejects symbols reached only by local exports', function () {
            const bundle = peerBundle([
                testResource(
                    '/b/entry.d.ts',
                    'entry.d.ts',
                    'export * as visible from "./internal.js";\nexport type { Internal };\n'
                ),
                testResource(
                    '/b/sentinel.d.ts',
                    'Stryker was here!',
                    'export type { Internal } from "./internal.js";\n'
                ),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertRejected([ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ], bundle);
        });

        it('rejects missing re-export targets even when an unrelated source can export the symbol', function () {
            const bundle = peerBundle([
                testResource(
                    '/b/entry.d.ts',
                    'entry.d.ts',
                    'export * as visible from "./internal.js";\nexport type { Internal } from "./missing.js";\n'
                ),
                testResource('Stryker was here', 'stryker.d.ts', 'export type { Internal } from "./internal.js";\n'),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertRejected([ namedRequest('/b/internal.d.ts', [ 'Internal' ]) ], bundle);
        });

        it('rejects named cycles that do not reach the requested source file', function () {
            const bundle = peerBundle([
                testResource(
                    '/b/entry.d.ts',
                    'entry.d.ts',
                    'export type { Missing } from "./middle.js";\nexport * as visible from "./internal.js";\n'
                ),
                testResource('/b/middle.d.ts', 'middle.d.ts', 'export type { Missing } from "./entry.js";\n'),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertRejected([ namedRequest('/b/internal.d.ts', [ 'Missing' ]) ], bundle);
        });

        it('rejects namespace cycles that do not reach the requested source file', function () {
            const bundle = peerBundle([
                testResource(
                    '/b/entry.d.ts',
                    'entry.d.ts',
                    'export * from "./middle.js";\nexport * as visible from "./internal.js";\n'
                ),
                testResource('/b/middle.d.ts', 'middle.d.ts', 'export * from "./entry.js";\n'),
                testResource('/b/internal.d.ts', 'internal.d.ts', '')
            ]);

            assertRejected([ namespaceRequest('/b/internal.d.ts') ], bundle);
        });
    });
});
