import assert from 'node:assert';
import { test } from 'mocha';
import { plainRoot, rootWithSource, shebangRoot } from '../test-libraries/package-surface-fixtures.ts';
import { buildExplicitBinField } from './explicit-bin.ts';
import type { ExplicitSurface } from './package-shape.ts';

const cliBin: ExplicitSurface = {
    mode: 'explicit',
    packageInterface: { bins: [{ root: 'cli', name: 'package-a' }] }
};

test('returns undefined when the explicit surface declares no bins', () => {
    const modulesOnly: ExplicitSurface = {
        mode: 'explicit',
        packageInterface: { modules: [{ root: 'main', export: '.' }] }
    };

    assert.strictEqual(buildExplicitBinField({ name: 'package-a', roots: {} }, modulesOnly), undefined);
});

test("maps a single bin to the root's import target", () => {
    assert.deepStrictEqual(
        buildExplicitBinField({ name: 'package-a', roots: { cli: shebangRoot('cli.js') } }, cliBin),
        { 'package-a': './cli.js' }
    );
});

test('maps multiple bins to their roots', () => {
    const surface: ExplicitSurface = {
        mode: 'explicit',
        packageInterface: {
            bins: [
                { root: 'a', name: 'tool-a' },
                { root: 'b', name: 'tool-b' }
            ]
        }
    };

    assert.deepStrictEqual(
        buildExplicitBinField(
            { name: 'package-a', roots: { a: shebangRoot('a.js'), b: shebangRoot('b.js') } },
            surface
        ),
        { 'tool-a': './a.js', 'tool-b': './b.js' }
    );
});

test('throws when a bin root has no shebang in its content', () => {
    assert.throws(() => {
        buildExplicitBinField({ name: 'package-a', roots: { cli: plainRoot('cli.js') } }, cliBin);
    }, /^Error: Package "package-a" bin "package-a" must point to a root with a shebang$/u);
});

test('rejects executable-without-shebang roots as bin targets', () => {
    const executableWithoutShebang = rootWithSource('', 'cli.js', { content: 'plain\n', isExecutable: true });

    assert.throws(() => {
        buildExplicitBinField({ name: 'package-a', roots: { cli: executableWithoutShebang } }, cliBin);
    }, /^Error: Package "package-a" bin "package-a" must point to a root with a shebang$/u);
});

test('throws when a bin references an unknown root', () => {
    const missingBin: ExplicitSurface = {
        mode: 'explicit',
        packageInterface: { bins: [{ root: 'missing', name: 'package-a' }] }
    };

    assert.throws(() => {
        buildExplicitBinField({ name: 'package-a', roots: { cli: shebangRoot('cli.js') } }, missingBin);
    }, /^Error: Package "package-a" references unknown root "missing"$/u);
});
