import assert from 'node:assert';
import { suite, test } from 'mocha';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import { bundleResource, externalDependency, linkedBundle } from '../test-libraries/bundle-fixtures.ts';
import { createTestEliminator } from '../test-libraries/eliminator-fixtures.ts';
import { collectTargetPaths, inputs } from '../test-libraries/eliminator-test-support.ts';

type TestDependency = {
    readonly name: string;
    readonly referencedFrom: readonly [string, ...(readonly string[])];
};

function assertDefined<T>(value: T | undefined): asserts value is T {
    if (value === undefined) {
        assert.fail('expected value to be defined');
    }
}

function mapKeys(map: ReadonlyMap<string, unknown> | undefined): readonly string[] {
    assertDefined(map);
    return Array.from(map.keys());
}

function dependencyMap(...names: readonly string[]): ReadonlyMap<string, TestDependency> {
    return new Map(names.map(function (name) {
        return [ name, externalDependency(name) ];
    }));
}

function substitutedSourcePaths(...names: readonly string[]): ReadonlyMap<string, ReadonlySet<string>> {
    return new Map(names.map(function (name) {
        return [ name, new Set([ `/${name}/index.js` ]) ];
    }));
}

function oneFileBundle(
    content: string,
    metadata: Pick<
        LinkedBundle,
        'externalDependencies' | 'linkedBundleDependencies' | 'substitutedSourceFilePathsByPackageName'
    >,
    isSubstituted: boolean
): LinkedBundle {
    return linkedBundle({
        name: 'a',
        contents: [ {
            ...bundleResource('/src/index.js', { content, targetFilePath: 'index.js' }),
            isSubstituted
        } ],
        ...metadata
    });
}

function externalIndexBundle(content: string, dependencies: ReadonlyMap<string, TestDependency>): LinkedBundle {
    return oneFileBundle(
        content,
        {
            externalDependencies: dependencies,
            linkedBundleDependencies: new Map(),
            substitutedSourceFilePathsByPackageName: new Map()
        },
        false
    );
}

function linkedIndexBundle(content: string): LinkedBundle {
    return oneFileBundle(
        content,
        {
            externalDependencies: new Map(),
            linkedBundleDependencies: dependencyMap('pkg-b'),
            substitutedSourceFilePathsByPackageName: substitutedSourcePaths('pkg-b')
        },
        true
    );
}

function transformedResource(
    sourceFilePath: string,
    content: string,
    targetFilePath: string,
    directDependencies: ReadonlySet<string>
): LinkedBundle['contents'][number] {
    return {
        ...bundleResource(sourceFilePath, { content, directDependencies, targetFilePath }),
        isSubstituted: false
    };
}

suite('eliminator dependency metadata', function () {
    suite('package metadata', function () {
        test('eliminate preserves roots while recomputing dependency metadata from transformed code', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [ {
                    ...bundleResource('/src/index.js', {
                        content: [
                            'import { live } from "dep";',
                            'function dead() { return import("stale"); }',
                            'export const api = live;'
                        ]
                            .join('\n'),
                        targetFilePath: 'index.js'
                    }),
                    isSubstituted: false
                } ],
                externalDependencies: dependencyMap('dep', 'stale'),
                linkedBundleDependencies: dependencyMap('bundle')
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assertDefined(analyzed);
            assert.strictEqual(analyzed.roots, input.roots);
            assert.deepStrictEqual(mapKeys(analyzed.externalDependencies), [ 'dep' ]);
            assert.deepStrictEqual(mapKeys(analyzed.linkedBundleDependencies), []);
        });

        test('eliminate keeps runtime dependency metadata for all-dead imports that become bare imports', async function () {
            const eliminator = createTestEliminator();
            const input = externalIndexBundle('import dep from "dep";\n', dependencyMap('dep'));
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), [ 'dep' ]);
            assert.strictEqual(analyzed?.contents[0]?.fileDescription.content, 'import "dep";\n');
        });

        test('eliminate removes type-only dependency metadata when the stale import is removed', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [ {
                    ...bundleResource('/src/index.ts', {
                        content: 'import type { Dead } from "types-dep";\nexport const api = 1;\n',
                        targetFilePath: 'index.ts'
                    }),
                    isSubstituted: false
                } ],
                externalDependencies: new Map([ [
                    'types-dep',
                    externalDependency('types-dep', [ '/src/index.ts' ])
                ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), []);
        });

        test('eliminate keeps import.meta.resolve dependency metadata when the call survives', async function () {
            const eliminator = createTestEliminator();
            const input = externalIndexBundle(
                'export const api = import.meta.resolve( "dep" );\n',
                dependencyMap('dep')
            );
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), [ 'dep' ]);
        });

        test('eliminate records scoped package metadata by package root', async function () {
            const eliminator = createTestEliminator();
            const input = externalIndexBundle(
                'import { api } from "@scope/pkg/subpath";\nexport const value = api;\n',
                dependencyMap('@scope/pkg', '@scope')
            );
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), [ '@scope/pkg' ]);
        });

        test('eliminate records unscoped subpath metadata by package root', async function () {
            const eliminator = createTestEliminator();
            const input = externalIndexBundle(
                'import { api } from "dep/subpath";\nexport const value = api;\n',
                dependencyMap('dep', 'dep/subpath')
            );
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), [ 'dep' ]);
        });

        test('eliminate rejects invalid scoped package specifiers in transformed code', async function () {
            const eliminator = createTestEliminator();
            const input = externalIndexBundle(
                'import { api } from "@scope";\nexport const value = api;\n',
                dependencyMap('@scope')
            );
            await assert.rejects(eliminator.eliminate(inputs(input)), /Invalid package specifier "@scope"/u);
        });

        test('eliminate ignores import-map specifiers in dependency metadata', async function () {
            const eliminator = createTestEliminator();
            const input = externalIndexBundle(
                'import { api } from "#internal";\nexport const value = api;\n',
                dependencyMap('#internal')
            );
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), []);
        });

        test('eliminate does not borrow package metadata from another source file', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource('/src/index.js', 'export const api = 1;\n', 'index.js', new Set<string>()),
                    transformedResource(
                        '/src/other.js',
                        'import { api } from "dep";\nexport const other = api;\n',
                        'other.js',
                        new Set<string>()
                    )
                ],
                externalDependencies: new Map([ [ 'dep', externalDependency('dep', [ '/src/index.js' ]) ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), []);
        });
    });

    suite('local dependency metadata', function () {
        test('eliminate removes stale local direct dependencies from transformed resources', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.js',
                        'function dead() { return import("./dead.js"); }\nexport const api = 1;\n',
                        'index.js',
                        new Set([ '/src/dead.js' ])
                    ),
                    transformedResource('/src/dead.js', 'export const dead = 1;\n', 'dead.js', new Set<string>())
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set<string>());
            assert.deepStrictEqual(collectTargetPaths(analyzed), [ 'index.js', 'dead.js' ]);
        });

        test('eliminate keeps surviving local direct dependencies from transformed resources', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.js',
                        'import { live } from "./live.js";\nexport const api = live;\n',
                        'index.js',
                        new Set([ '/src/live.js' ])
                    ),
                    transformedResource('/src/live.js', 'export const live = 1;\n', 'live.js', new Set<string>())
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set([ '/src/live.js' ]));
        });

        test('eliminate does not treat package imports as local direct dependencies', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.js',
                        'import "dep";\nexport const api = 1;\n',
                        'index.js',
                        new Set([ '/src/dep' ])
                    )
                ],
                externalDependencies: dependencyMap('dep')
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set<string>());
        });

        test('eliminate does not borrow local direct dependencies from another source file', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.js',
                        'export const api = 1;\n',
                        'index.js',
                        new Set([ '/src/dead.js' ])
                    ),
                    transformedResource(
                        '/src/other.js',
                        'import "./dead.js";\nexport const other = 1;\n',
                        'other.js',
                        new Set<string>()
                    )
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set<string>());
        });

        test('eliminate keeps extensionless local direct dependency candidates', async function () {
            const eliminator = createTestEliminator();
            const localDependencies = new Set([
                '/src/live.js',
                '/src/live.jsx',
                '/src/live.ts',
                '/src/live.tsx',
                '/src/live.json'
            ]);
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.js',
                        'import "./live";\nexport const api = 1;\n',
                        'index.js',
                        localDependencies
                    )
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, localDependencies);
        });

        test('eliminate keeps source-map direct dependencies after code transforms', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.js',
                        'export const api = 1;\n',
                        'index.js',
                        new Set([ '/src/index.js.map' ])
                    )
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set([ '/src/index.js.map' ]));
        });

        test('eliminate recomputes direct dependencies for commonjs modules', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.cjs',
                        'exports.api = 1;\n',
                        'index.cjs',
                        new Set([ '/src/dead.js' ])
                    )
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set<string>());
        });

        test('eliminate keeps commonjs import.meta.resolve dependency metadata', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.cjs',
                        'exports.api = import.meta.resolve( "dep" );\n',
                        'index.cjs',
                        new Set<string>()
                    )
                ],
                externalDependencies: new Map([ [ 'dep', externalDependency('dep', [ '/src/index.cjs' ]) ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), [ 'dep' ]);
        });

        test('eliminate keeps non-code direct dependencies unchanged', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource('/src/LICENSE', 'license', 'LICENSE', new Set([ '/src/dead.js' ]))
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set([ '/src/dead.js' ]));
        });
    });

    suite('declaration and sibling metadata', function () {
        test('eliminate does not infer package metadata from non-code files', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [ transformedResource('/src/LICENSE', 'license', 'LICENSE', new Set<string>()) ],
                externalDependencies: new Map([ [ 'dep', externalDependency('dep', [ '/src/LICENSE' ]) ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), []);
        });

        test('eliminate preserves declaration-file package metadata from the original scan', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [ transformedResource('/src/index.d.ts', 'export {};\n', 'index.d.ts', new Set<string>()) ],
                externalDependencies: new Map([ [
                    '@types/dep',
                    externalDependency('@types/dep', [ '/src/index.d.ts' ])
                ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), [ '@types/dep' ]);
        });

        test('eliminate preserves declaration direct dependencies for js specifier peers', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.d.ts',
                        'export type Api = import("./foo.js").Api;\n',
                        'index.d.ts',
                        new Set([ '/src/foo.d.ts' ])
                    )
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set([ '/src/foo.d.ts' ]));
        });

        test('eliminate does not keep declaration peers for JavaScript imports', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.js',
                        'import "./live.js";\nexport const api = 1;\n',
                        'index.js',
                        new Set([ '/src/live.js', '/src/live.d.ts' ])
                    )
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set([ '/src/live.js' ]));
        });

        test('eliminate uses the final js suffix for declaration peer paths', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/index.d.ts',
                        'export type Api = import("./foo.js/index.js").Api;\n',
                        'index.d.ts',
                        new Set([ '/src/foo.js/index.d.ts' ])
                    )
                ]
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.contents[0]?.directDependencies, new Set([ '/src/foo.js/index.d.ts' ]));
        });

        test('eliminate preserves repeated dependency references from surviving files', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                contents: [
                    transformedResource(
                        '/src/a.js',
                        'import { api } from "dep";\nexport const a = api;\n',
                        'a.js',
                        new Set<string>()
                    ),
                    transformedResource(
                        '/src/b.js',
                        'import { api } from "dep";\nexport const b = api;\n',
                        'b.js',
                        new Set<string>()
                    )
                ],
                externalDependencies: new Map([ [
                    'dep',
                    externalDependency('dep', [ '/src/a.js', '/src/b.js' ])
                ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(analyzed?.externalDependencies.get('dep'), {
                name: 'dep',
                referencedFrom: [ '/src/a.js', '/src/b.js' ]
            });
        });

        test('eliminate drops dependency metadata for missing transformed files', async function () {
            const eliminator = createTestEliminator();
            const input = linkedBundle({
                name: 'a',
                externalDependencies: new Map([ [ 'dep', externalDependency('dep', [ '/src/missing.js' ]) ] ])
            });
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), []);
        });

        test('eliminate removes stale linked bundle dependency metadata', async function () {
            const eliminator = createTestEliminator();
            const input = linkedIndexBundle('function dead() { return import("pkg-b"); }\nexport const value = 1;\n');
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.linkedBundleDependencies), []);
            assert.deepStrictEqual(mapKeys(analyzed?.substitutedSourceFilePathsByPackageName), []);
        });

        test('eliminate preserves surviving linked bundle dependency metadata', async function () {
            const eliminator = createTestEliminator();
            const input = linkedIndexBundle('import { api } from "pkg-b";\nexport const value = api;\n');
            const [ analyzed ] = await eliminator.eliminate(inputs(input));
            assert.deepStrictEqual(mapKeys(analyzed?.linkedBundleDependencies), [ 'pkg-b' ]);
            assert.deepStrictEqual(mapKeys(analyzed?.substitutedSourceFilePathsByPackageName), [ 'pkg-b' ]);
        });

        test('eliminate keeps dependency metadata when transformations are disabled', async function () {
            const eliminator = createTestEliminator();
            const input = externalIndexBundle(
                'function dead() { return import("dep"); }\nexport const api = 1;\n',
                dependencyMap('dep')
            );
            const [ analyzed ] = await eliminator.eliminate([ {
                bundle: input,
                transformationsEnabled: false
            } ]);
            assert.deepStrictEqual(mapKeys(analyzed?.externalDependencies), [ 'dep' ]);
        });
    });
});
