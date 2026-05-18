import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildOptionalVersionedBundleFields } from './optional-bundle-fields.ts';

const fileDescription = {
    sourceFilePath: '/src/index.d.ts',
    targetFilePath: 'index.d.ts',
    content: '',
    isExecutable: false
};

suite('optional-bundle-fields', function () {
    test('buildOptionalVersionedBundleFields returns an empty object when every field is undefined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: undefined,
                binField: undefined,
                typesMainFile: undefined
            }),
            {}
        );
    });

    test('buildOptionalVersionedBundleFields includes importsField when it is defined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: { '#foo': './foo.js' },
                binField: undefined,
                typesMainFile: undefined
            }),
            { importsField: { '#foo': './foo.js' } }
        );
    });

    test('buildOptionalVersionedBundleFields includes binField when it is defined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: undefined,
                binField: { 'pkg-a': './cli.js' },
                typesMainFile: undefined
            }),
            { binField: { 'pkg-a': './cli.js' } }
        );
    });

    test('buildOptionalVersionedBundleFields includes typesMainFile when it is defined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: undefined,
                binField: undefined,
                typesMainFile: fileDescription
            }),
            { typesMainFile: fileDescription }
        );
    });

    test('buildOptionalVersionedBundleFields includes every defined field together', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: { '#foo': './foo.js' },
                binField: { 'pkg-a': './cli.js' },
                typesMainFile: fileDescription
            }),
            {
                importsField: { '#foo': './foo.js' },
                binField: { 'pkg-a': './cli.js' },
                typesMainFile: fileDescription
            }
        );
    });
});
