import assert from 'node:assert';
import { suite, test } from 'mocha';
import {
    executableShebangRoot,
    plainRoot,
    rootWithSource,
    shebangRoot
} from '../test-libraries/package-surface-fixtures.ts';
import { buildImplicitBinField } from './implicit-bin.ts';

suite('implicit-bin', function () {
    test('returns undefined when no roots are executable shebang scripts', function () {
        const result = buildImplicitBinField({ name: 'package-a', roots: { main: plainRoot('index.js') } });

        assert.strictEqual(result, undefined);
    });

    test('returns undefined when a shebang root is not marked executable', function () {
        assert.strictEqual(
            buildImplicitBinField({ name: 'package-a', roots: { cli: shebangRoot('cli.js') } }),
            undefined
        );
    });

    test('returns undefined when an executable root lacks a shebang in its content', function () {
        const executableWithoutShebang = rootWithSource('', 'cli.js', { content: 'plain\n', isExecutable: true });

        assert.strictEqual(
            buildImplicitBinField({ name: 'package-a', roots: { cli: executableWithoutShebang } }),
            undefined
        );
    });

    test('maps a single executable shebang root to the unscoped package name', function () {
        const result = buildImplicitBinField({
            name: '@scope/package-a',
            roots: { cli: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { 'package-a': './cli.js' });
    });

    test('uses the full name for an unscoped package', function () {
        const result = buildImplicitBinField({
            name: 'package-a',
            roots: { cli: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { 'package-a': './cli.js' });
    });

    test('treats names like "@scope" without a slash as their own bin name', function () {
        const result = buildImplicitBinField({
            name: '@scope',
            roots: { cli: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { '@scope': './cli.js' });
    });

    test('preserves an @scope-like substring that does not start the package name', function () {
        const result = buildImplicitBinField({
            name: 'prefix@scope/package-a',
            roots: { cli: executableShebangRoot('cli.js') }
        });

        assert.deepStrictEqual(result, { 'prefix@scope/package-a': './cli.js' });
    });

    test('throws when more than one root qualifies as an implicit bin', function () {
        assert.throws(() => {
            buildImplicitBinField({
                name: 'package-a',
                roots: {
                    cli: executableShebangRoot('cli.js'),
                    worker: executableShebangRoot('worker.js')
                }
            });
        }, /^Error: Package "package-a" has multiple executable shebang roots; declare packageInterface\.bins explicitly$/u);
    });
});
