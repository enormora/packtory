import assert from 'node:assert';
import { suite, test } from 'mocha';
import { buildOptionalVersionedBundleFields } from './optional-bundle-fields.ts';

const fileDescription = {
    inputFilePath: '/source/index.d.ts',
    targetFilePath: 'index.d.ts',
    content: '',
    isExecutable: false
};

suite('optional-bundle-fields', function () {
    test('buildOptionalVersionedBundleFields returns an empty object when every field is undefined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: undefined,
                executableField: undefined,
                typesMainFile: undefined
            }),
            {}
        );
    });

    test('buildOptionalVersionedBundleFields includes importsField when it is defined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: { '#foo': './foo.js' },
                executableField: undefined,
                typesMainFile: undefined
            }),
            { importsField: { '#foo': './foo.js' } }
        );
    });

    test('buildOptionalVersionedBundleFields includes executableField when it is defined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: undefined,
                executableField: { 'package-a': './cli.js' },
                typesMainFile: undefined
            }),
            { executableField: { 'package-a': './cli.js' } }
        );
    });

    test('buildOptionalVersionedBundleFields includes typesMainFile when it is defined', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: undefined,
                executableField: undefined,
                typesMainFile: fileDescription
            }),
            { typesMainFile: fileDescription }
        );
    });

    test('buildOptionalVersionedBundleFields includes every defined field together', function () {
        assert.deepStrictEqual(
            buildOptionalVersionedBundleFields({
                importsField: { '#foo': './foo.js' },
                executableField: { 'package-a': './cli.js' },
                typesMainFile: fileDescription
            }),
            {
                importsField: { '#foo': './foo.js' },
                executableField: { 'package-a': './cli.js' },
                typesMainFile: fileDescription
            }
        );
    });
});
