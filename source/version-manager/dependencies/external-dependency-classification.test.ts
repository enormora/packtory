import assert from 'node:assert';
import { test } from 'mocha';
import type { ExternalDependency } from '../../dependency-scanner/external-dependencies.ts';
import type { MainPackageJson } from '../../config/package-json.ts';
import { groupExternalDependencies } from './external-dependency-classification.ts';

function externalDep(name: string): ExternalDependency {
    return { name, referencedFrom: ['/src/a.ts'] };
}

const baseMainPackageJson: MainPackageJson = { type: 'module' };
const workspaceMalformedReason =
    'workspace protocol is yarn/pnpm/bun-specific; resolved at install time by the workspace,' +
    ' not valid in a published manifest';

test('groupExternalDependencies returns empty groups when the bundle has no external dependencies', () => {
    assert.deepStrictEqual(groupExternalDependencies({ externalDependencies: new Map() }, baseMainPackageJson, []), {
        dependencies: {},
        peerDependencies: {}
    });
});

test('groupExternalDependencies routes a direct dependency version to dependencies', () => {
    assert.deepStrictEqual(
        groupExternalDependencies(
            { externalDependencies: new Map([['left-pad', externalDep('left-pad')]]) },
            { ...baseMainPackageJson, dependencies: { 'left-pad': '^1.0.0' } },
            []
        ),
        { dependencies: { 'left-pad': '^1.0.0' }, peerDependencies: {} }
    );
});

test('groupExternalDependencies routes a peer dependency version to peerDependencies', () => {
    assert.deepStrictEqual(
        groupExternalDependencies(
            { externalDependencies: new Map([['react', externalDep('react')]]) },
            { ...baseMainPackageJson, peerDependencies: { react: '^19.0.0' } },
            []
        ),
        { dependencies: {}, peerDependencies: { react: '^19.0.0' } }
    );
});

test('groupExternalDependencies prefers peerDependencies over dependencies when the dep is in both', () => {
    assert.deepStrictEqual(
        groupExternalDependencies(
            { externalDependencies: new Map([['react', externalDep('react')]]) },
            {
                ...baseMainPackageJson,
                dependencies: { react: '^18.0.0' },
                peerDependencies: { react: '^19.0.0' }
            },
            []
        ),
        { dependencies: {}, peerDependencies: { react: '^19.0.0' } }
    );
});

test('groupExternalDependencies throws when an external dependency is missing from the main package.json', () => {
    try {
        groupExternalDependencies(
            { externalDependencies: new Map([['left-pad', externalDep('left-pad')]]) },
            baseMainPackageJson,
            []
        );
        assert.fail('Expected groupExternalDependencies() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual(
            (error as Error).message,
            'Couldn’t determine version number of left-pad, because it is not listed in the main package.json'
        );
    }
});

test('groupExternalDependencies throws a mutable-specifier message when a dep uses a git url', () => {
    const expected = [
        "Refusing to publish: 1 dependency uses a mutable specifier, which bypasses the npm registry's integrity guarantees:",
        '  - "react" → "git+https://github.com/our-fork/react#v18.0.0" (git)',
        'Add the dep name to dependencyPolicy.allowMutableSpecifiers to allow this on purpose.'
    ].join('\n');
    try {
        groupExternalDependencies(
            { externalDependencies: new Map([['react', externalDep('react')]]) },
            { ...baseMainPackageJson, dependencies: { react: 'git+https://github.com/our-fork/react#v18.0.0' } },
            []
        );
        assert.fail('Expected groupExternalDependencies() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expected);
    }
});

test('groupExternalDependencies throws a malformed-specifier message when a dep uses workspace:', () => {
    const expected = [
        'Refusing to publish: 1 dependency has a specifier that npm cannot publish:',
        `  - "shared-utils" → "workspace:*" (${workspaceMalformedReason})`,
        'Replace with a registry version (e.g. "^1.2.3"). Mutable-specifier allow-listing does not apply here.'
    ].join('\n');
    try {
        groupExternalDependencies(
            { externalDependencies: new Map([['shared-utils', externalDep('shared-utils')]]) },
            { ...baseMainPackageJson, dependencies: { 'shared-utils': 'workspace:*' } },
            []
        );
        assert.fail('Expected groupExternalDependencies() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expected);
    }
});

test('groupExternalDependencies prefers a malformed-specifier error over a mutable one', () => {
    try {
        groupExternalDependencies(
            {
                externalDependencies: new Map([
                    ['shared-utils', externalDep('shared-utils')],
                    ['react', externalDep('react')]
                ])
            },
            {
                ...baseMainPackageJson,
                dependencies: {
                    'shared-utils': 'workspace:*',
                    react: 'git+https://github.com/foo/bar#v1'
                }
            },
            []
        );
        assert.fail('Expected groupExternalDependencies() to throw but it did not');
    } catch (error: unknown) {
        assert.match((error as Error).message, /npm cannot publish/u);
    }
});

test('groupExternalDependencies lets a mutable specifier through when its name is in allowMutableSpecifiers', () => {
    assert.deepStrictEqual(
        groupExternalDependencies(
            { externalDependencies: new Map([['react', externalDep('react')]]) },
            { ...baseMainPackageJson, dependencies: { react: 'git+https://github.com/our-fork/react#v18.0.0' } },
            ['react']
        ),
        {
            dependencies: { react: 'git+https://github.com/our-fork/react#v18.0.0' },
            peerDependencies: {}
        }
    );
});

test('groupExternalDependencies throws when an allowMutableSpecifiers entry matches no rejected dep', () => {
    const expected = [
        'Refusing to publish: 1 entry in dependencyPolicy.allowMutableSpecifiers is not in use:',
        '  - "old-vendored-pkg"',
        'Remove unused entries — they reflect stale exceptions to the integrity policy.'
    ].join('\n');
    try {
        groupExternalDependencies(
            { externalDependencies: new Map([['left-pad', externalDep('left-pad')]]) },
            { ...baseMainPackageJson, dependencies: { 'left-pad': '^1.0.0' } },
            ['old-vendored-pkg']
        );
        assert.fail('Expected groupExternalDependencies() to throw but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, expected);
    }
});

test('groupExternalDependencies prefers a mutable error over an unused-allow-list error', () => {
    try {
        groupExternalDependencies(
            { externalDependencies: new Map([['react', externalDep('react')]]) },
            { ...baseMainPackageJson, dependencies: { react: 'git+https://github.com/foo/bar#v1' } },
            ['old-vendored-pkg']
        );
        assert.fail('Expected groupExternalDependencies() to throw but it did not');
    } catch (error: unknown) {
        assert.match((error as Error).message, /uses a mutable specifier/u);
    }
});
