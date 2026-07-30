import assert from 'node:assert';
import { suite, test } from 'mocha';
import { reachableDeclarationPaths } from './type-script-declaration-reachability.ts';

type SpecifiersByPath = Readonly<Record<string, readonly string[]>>;

function sortedPaths(paths: Iterable<string>): readonly string[] {
    return Array.from(paths).toSorted(function (left, right) {
        return left.localeCompare(right);
    });
}

type ReachabilityCase = {
    readonly declarationPaths: readonly string[];
    readonly rootPaths: readonly string[];
    readonly specifiers: SpecifiersByPath;
};

function reachablePathsOf(testCase: ReachabilityCase): readonly string[] {
    const reachable = reachableDeclarationPaths({
        declarationPaths: new Set(testCase.declarationPaths),
        rootPaths: new Set(testCase.rootPaths),
        moduleSpecifiersOf(declarationPath) {
            return testCase.specifiers[declarationPath] ?? [];
        }
    });

    return sortedPaths(reachable);
}

suite('type-script-declaration-reachability', function () {
    test('reaches the root declarations themselves', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'index.d.ts', 'private.d.ts' ],
                rootPaths: [ 'index.d.ts' ],
                specifiers: {}
            }),
            [ 'index.d.ts' ]
        );
    });

    test('follows relative imports transitively', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'index.d.ts', 'leaf.d.ts', 'deep.d.ts', 'private.d.ts' ],
                rootPaths: [ 'index.d.ts' ],
                specifiers: {
                    'index.d.ts': [ './leaf.js' ],
                    'leaf.d.ts': [ './deep.js' ]
                }
            }),
            [ 'deep.d.ts', 'index.d.ts', 'leaf.d.ts' ]
        );
    });

    test('visits cyclic imports without repeating a declaration', function () {
        const visited: string[] = [];
        const reachable = reachableDeclarationPaths({
            declarationPaths: new Set([ 'index.d.ts', 'leaf.d.ts' ]),
            rootPaths: new Set([ 'index.d.ts' ]),
            moduleSpecifiersOf(declarationPath) {
                visited.push(declarationPath);
                return declarationPath === 'index.d.ts' ? [ './leaf.js' ] : [ './index.js' ];
            }
        });

        assert.deepStrictEqual(sortedPaths(reachable), [ 'index.d.ts', 'leaf.d.ts' ]);
        assert.deepStrictEqual(sortedPaths(visited), [ 'index.d.ts', 'leaf.d.ts' ]);
    });

    test('follows a declaration that imports itself', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'index.d.ts' ],
                rootPaths: [ 'index.d.ts' ],
                specifiers: { 'index.d.ts': [ './index.js' ] }
            }),
            [ 'index.d.ts' ]
        );
    });

    test('follows the same import referenced more than once', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'index.d.ts', 'leaf.d.ts' ],
                rootPaths: [ 'index.d.ts' ],
                specifiers: { 'index.d.ts': [ './leaf.js', './leaf.js' ] }
            }),
            [ 'index.d.ts', 'leaf.d.ts' ]
        );
    });

    test('ignores imports that are not relative', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'index.d.ts', 'external.d.ts' ],
                rootPaths: [ 'index.d.ts' ],
                specifiers: { 'index.d.ts': [ 'external', '#internal' ] }
            }),
            [ 'index.d.ts' ]
        );
    });

    test('ignores imports that resolve to a file the package does not contain', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'index.d.ts' ],
                rootPaths: [ 'index.d.ts' ],
                specifiers: { 'index.d.ts': [ './missing.js' ] }
            }),
            [ 'index.d.ts' ]
        );
    });

    test('ignores roots the package does not contain', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'private.d.ts' ],
                rootPaths: [ 'missing.d.ts' ],
                specifiers: { 'private.d.ts': [] }
            }),
            []
        );
    });

    test('reaches declarations from every root', function () {
        assert.deepStrictEqual(
            reachablePathsOf({
                declarationPaths: [ 'index.d.ts', 'feature.d.ts', 'private.d.ts' ],
                rootPaths: [ 'index.d.ts', 'feature.d.ts' ],
                specifiers: {}
            }),
            [ 'feature.d.ts', 'index.d.ts' ]
        );
    });
});
