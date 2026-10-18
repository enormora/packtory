import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    executableShebangRoot,
    plainRoot,
    rootWithSource,
    shebangRoot
} from '../test-libraries/package-surface-fixtures.ts';
import { buildImplicitExecutableField } from './implicit-executable.ts';

suite('implicit-bin', function () {
    test('returns undefined when no roots are executable shebang scripts', function () {
        const result = buildImplicitExecutableField({ name: 'package-a', roots: { main: plainRoot('index.js') } });

        assert.strictEqual(result, undefined);
    });

    test('returns undefined when a shebang root is not marked executable', function () {
        assert.strictEqual(
            buildImplicitExecutableField({ name: 'package-a', roots: { commandLineInterface: shebangRoot('cli.js') } }),
            undefined
        );
    });

    test('returns undefined when an executable root lacks a shebang in its content', function () {
        const executableWithoutShebang = rootWithSource('', 'cli.js', { content: 'plain\n', isExecutable: true });

        assert.strictEqual(
            buildImplicitExecutableField({
                name: 'package-a',
                roots: { commandLineInterface: executableWithoutShebang }
            }),
            undefined
        );
    });

    test('maps a single executable shebang root to the unscoped package name', function () {
        const result = buildImplicitExecutableField({
            name: '@scope/package-a',
            roots: { commandLineInterface: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { 'package-a': './cli.js' });
    });

    test('uses the full name for an unscoped package', function () {
        const result = buildImplicitExecutableField({
            name: 'package-a',
            roots: { commandLineInterface: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { 'package-a': './cli.js' });
    });

    test('treats names like "@scope" without a slash as their own bin name', function () {
        const result = buildImplicitExecutableField({
            name: '@scope',
            roots: { commandLineInterface: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { '@scope': './cli.js' });
    });

    test('preserves an @scope-like substring that does not start the package name', function () {
        const result = buildImplicitExecutableField({
            name: 'prefix@scope/package-a',
            roots: { commandLineInterface: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { 'prefix@scope/package-a': './cli.js' });
    });

    test('throws when more than one root qualifies as an implicit bin', function () {
        assert.throws(
            function () {
                buildImplicitExecutableField({
                    name: 'package-a',
                    roots: {
                        commandLineInterface: executableShebangRoot('cli.js'),
                        worker: executableShebangRoot('worker.js')
                    }
                });
            },
            /^Error: Package "package-a" has multiple executable shebang roots; declare packageInterface\.executables explicitly$/u
        );
    });
});
