import assert from 'node:assert';
import { suite, test } from 'mocha';
import { plainRoot, rootWithSource, shebangRoot } from '../test-libraries/package-surface-fixtures.ts';
import { buildExplicitExecutableField } from './explicit-executable.ts';
import type { ExplicitSurface } from './package-shape.ts';

const commandLineInterfaceExecutable: ExplicitSurface = {
    mode: 'explicit',
    packageInterface: { executables: [ { root: 'commandLineInterface', name: 'package-a' } ] }
};

suite('explicit-bin', function () {
    test('returns undefined when the explicit surface declares no executables', function () {
        const modulesOnly: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { modules: [ { root: 'main', export: '.' } ] }
        };

        assert.strictEqual(buildExplicitExecutableField({ name: 'package-a', roots: {} }, modulesOnly), undefined);
    });

    test("maps a single bin to the root's import target", function () {
        assert.deepStrictEqual(
            buildExplicitExecutableField(
                { name: 'package-a', roots: { commandLineInterface: shebangRoot('cli.js') } },
                commandLineInterfaceExecutable
            ),
            { 'package-a': './cli.js' }
        );
    });

    test('maps multiple executables to their roots', function () {
        const surface: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: {
                executables: [
                    { root: 'a', name: 'tool-a' },
                    { root: 'b', name: 'tool-b' }
                ]
            }
        };

        assert.deepStrictEqual(
            buildExplicitExecutableField(
                { name: 'package-a', roots: { a: shebangRoot('a.js'), b: shebangRoot('b.js') } },
                surface
            ),
            { 'tool-a': './a.js', 'tool-b': './b.js' }
        );
    });

    test('throws when a bin root has no shebang in its content', function () {
        assert.throws(function () {
            buildExplicitExecutableField(
                { name: 'package-a', roots: { commandLineInterface: plainRoot('cli.js') } },
                commandLineInterfaceExecutable
            );
        }, /^Error: Package "package-a" bin "package-a" must point to a root with a shebang$/u);
    });

    test('rejects executable-without-shebang roots as bin targets', function () {
        const executableWithoutShebang = rootWithSource('', 'cli.js', { content: 'plain\n', isExecutable: true });

        assert.throws(function () {
            buildExplicitExecutableField({
                name: 'package-a',
                roots: { commandLineInterface: executableWithoutShebang }
            }, commandLineInterfaceExecutable);
        }, /^Error: Package "package-a" bin "package-a" must point to a root with a shebang$/u);
    });

    test('throws when a bin references an unknown root', function () {
        const missingExecutable: ExplicitSurface = {
            mode: 'explicit',
            packageInterface: { executables: [ { root: 'missing', name: 'package-a' } ] }
        };

        assert.throws(function () {
            buildExplicitExecutableField(
                { name: 'package-a', roots: { commandLineInterface: shebangRoot('cli.js') } },
                missingExecutable
            );
        }, /^Error: Package "package-a" references unknown root "missing"$/u);
    });
});
