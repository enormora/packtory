import assert from 'node:assert';
import { suite, test } from 'mocha';
import { safeParse } from '../common/schema-validation.ts';
import { checkValidationFailure, checkValidationSuccess } from '../test-libraries/verify-schema-validation.ts';
import { additionalFileDescriptionSchema } from './additional-files.ts';

suite('additional-files', function () {
    test('schema accepts a valid additional file description', function () {
        assert.strictEqual(
            safeParse(additionalFileDescriptionSchema, { sourceFilePath: 'foo', targetFilePath: 'bar' }).success,
            true
        );
    });

    test('schema rejects an additional file description without targetFilePath', function () {
        assert.strictEqual(safeParse(additionalFileDescriptionSchema, { sourceFilePath: 'foo' }).success, false);
    });

    test(
        'validation succeeds when valid data is given',
        checkValidationSuccess({
            schema: additionalFileDescriptionSchema,
            data: {
                sourceFilePath: 'foo',
                targetFilePath: 'bar'
            },
            expectedData: {
                sourceFilePath: 'foo',
                targetFilePath: 'bar'
            }
        })
    );

    test(
        'validation fails when a non-object is given',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: true,
            expectedMessages: ['expected object, but got boolean']
        })
    );

    test(
        'validation fails when the an empty object is given',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: {},
            expectedMessages: ['at sourceFilePath: missing property', 'at targetFilePath: missing property']
        })
    );

    test(
        'validation fails when sourceFilePath is missing',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { targetFilePath: 'foo' },
            expectedMessages: ['at sourceFilePath: missing property']
        })
    );

    test(
        'validation fails when sourceFilePath is not a string',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { sourceFilePath: [], targetFilePath: 'foo' },
            expectedMessages: [
                'at sourceFilePath: expected string, but got array',
                'at sourceFilePath: array must contain at least 1 element'
            ]
        })
    );

    test(
        'validation fails when sourceFilePath is undefined',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { sourceFilePath: undefined, targetFilePath: 'foo' },
            expectedMessages: ['at sourceFilePath: expected string, but got undefined']
        })
    );

    test(
        'validation fails when sourceFilePath is null',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { sourceFilePath: null, targetFilePath: 'foo' },
            expectedMessages: ['at sourceFilePath: expected string, but got null']
        })
    );

    test(
        'validation fails when sourceFilePath is an empty string',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { sourceFilePath: '', targetFilePath: 'foo' },
            expectedMessages: ['at sourceFilePath: string must contain at least 1 character']
        })
    );

    test(
        'validation fails when targetFilePath is missing',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { sourceFilePath: 'foo' },
            expectedMessages: ['at targetFilePath: missing property']
        })
    );

    test(
        'validation fails when targetFilePath is not a string',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { targetFilePath: [], sourceFilePath: 'foo' },
            expectedMessages: [
                'at targetFilePath: expected string, but got array',
                'at targetFilePath: array must contain at least 1 element'
            ]
        })
    );

    test(
        'validation fails when targetFilePath is undefined',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { targetFilePath: undefined, sourceFilePath: 'foo' },
            expectedMessages: ['at targetFilePath: expected string, but got undefined']
        })
    );

    test(
        'validation fails when targetFilePath is null',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { targetFilePath: null, sourceFilePath: 'foo' },
            expectedMessages: ['at targetFilePath: expected string, but got null']
        })
    );

    test(
        'validation fails when targetFilePath is an empty string',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { targetFilePath: '', sourceFilePath: 'foo' },
            expectedMessages: ['at targetFilePath: string must contain at least 1 character']
        })
    );

    test(
        'validation fails when an additional unknown property is given',
        checkValidationFailure({
            schema: additionalFileDescriptionSchema,
            data: { targetFilePath: 'bar', sourceFilePath: 'foo', something: 'else' },
            expectedMessages: ['unexpected additional property: "something"']
        })
    );

    suite('safe relative targetFilePath', function () {
        for (const accepted of ['good/path.txt', 'nested/folder/file.txt', 'just-a-file.txt']) {
            test(
                `validation succeeds for "${accepted}"`,
                checkValidationSuccess({
                    schema: additionalFileDescriptionSchema,
                    data: { sourceFilePath: 'src', targetFilePath: accepted },
                    expectedData: { sourceFilePath: 'src', targetFilePath: accepted }
                })
            );
        }
    });

    suite('unsafe targetFilePath rejection', function () {
        for (const rejected of [
            '..',
            '../escape.txt',
            'foo/../bar.txt',
            'foo/..',
            '/etc/passwd',
            'C:/Windows/System32',
            'C:\\Windows\\System32',
            '..\\escape.txt',
            'foo\\..\\bar.txt'
        ]) {
            test(
                `validation fails for "${rejected}"`,
                checkValidationFailure({
                    schema: additionalFileDescriptionSchema,
                    data: { sourceFilePath: 'src', targetFilePath: rejected },
                    expectedMessages: ['at targetFilePath: invalid input']
                })
            );
        }
    });
});
