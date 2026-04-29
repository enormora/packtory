import assert from 'node:assert';
import { safeParse } from '@schema-hub/zod-error-formatter';
import { test, type Func } from 'mocha';
import type { $ZodType } from 'zod/v4/core';

const invalidNumberValue = 2;
const objectLikeFieldTypes = new Set(['object', 'record', 'tuple', 'array']);

type ValidationSuccessTestCase = {
    readonly schema: $ZodType;
    readonly data: unknown;
    readonly expectedData?: unknown;
};

export function checkValidationSuccess(testCase: Readonly<ValidationSuccessTestCase>): Func {
    return () => {
        const result = safeParse(testCase.schema, testCase.data);

        if (result.success) {
            if ('expectedData' in testCase) {
                assert.deepStrictEqual(result.data, testCase.expectedData);
            }

            return;
        }

        assert.fail(`Validation failed with: ${result.error.message}`);
    };
}

type ValidationFailureTestCase = {
    readonly schema: $ZodType;
    readonly data: unknown;
    readonly expectedMessages: string[];
};

export function checkValidationFailure(testCase: Readonly<ValidationFailureTestCase>): Func {
    return () => {
        const result = safeParse(testCase.schema, testCase.data);

        if (result.success) {
            assert.fail('Validation succeeded but a failure was expected');
        }

        assert.deepStrictEqual(result.error.issues, testCase.expectedMessages);
    };
}

type PathSegment = number | string;

type FieldTestOptions = {
    readonly schema: $ZodType;
    readonly data: Record<string, unknown>;
    readonly path: string;
    readonly expectedFieldType: string;
};

function pathDotNotationToBracketNotation(path: string): string {
    return path.replaceAll(/\.(?<index>\d+)(?=\.|$)/g, '[$<index>]');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parsePathSegment(pathSegment: string): PathSegment {
    return /^\d+$/.test(pathSegment) ? Number(pathSegment) : pathSegment;
}

function parsePath(path: string): readonly PathSegment[] {
    return path.split('.').map(parsePathSegment);
}

function removeArrayIndex(array: readonly unknown[], index: number): unknown[] {
    return array.filter((entryToIgnore, arrayIndex) => {
        return entryToIgnore !== undefined || arrayIndex !== index;
    });
}

function setArrayValue(array: readonly unknown[], index: number, value: unknown): unknown[] {
    return array.map((entry, arrayIndex) => {
        return arrayIndex === index ? value : entry;
    });
}

function removeRecordKey(record: Readonly<Record<string, unknown>>, key: string): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(record).filter(([entryKey]) => {
            return entryKey !== key;
        })
    );
}

function setRecordValue(
    record: Readonly<Record<string, unknown>>,
    key: string,
    value: unknown
): Record<string, unknown> {
    return {
        ...record,
        [key]: value
    };
}

function updateLeafArrayValue(
    current: readonly unknown[],
    pathSegment: number,
    modification: 'delete' | 'set',
    value: unknown
): unknown[] {
    return modification === 'delete'
        ? removeArrayIndex(current, pathSegment)
        : setArrayValue(current, pathSegment, value);
}

function updateLeafRecordValue(
    current: Readonly<Record<string, unknown>>,
    pathSegment: string,
    modification: 'delete' | 'set',
    value: unknown
): Record<string, unknown> {
    return modification === 'delete'
        ? removeRecordKey(current, pathSegment)
        : setRecordValue(current, pathSegment, value);
}

function updateLeafValue(
    current: unknown,
    pathSegment: PathSegment,
    modification: 'delete' | 'set',
    value: unknown
): unknown {
    if (Array.isArray(current) && typeof pathSegment === 'number') {
        return updateLeafArrayValue(current, pathSegment, modification, value);
    }

    if (isRecord(current) && typeof pathSegment === 'string') {
        return updateLeafRecordValue(current, pathSegment, modification, value);
    }

    return current;
}

function updateNestedValue(
    current: unknown,
    pathSegments: readonly PathSegment[],
    modification: 'delete' | 'set',
    value: unknown
): unknown {
    const [pathSegment, ...remainingPathSegments] = pathSegments;

    if (pathSegment === undefined) {
        return current;
    }

    if (remainingPathSegments.length === 0) {
        return updateLeafValue(current, pathSegment, modification, value);
    }

    if (Array.isArray(current) && typeof pathSegment === 'number') {
        return setArrayValue(
            current,
            pathSegment,
            updateNestedValue(current[pathSegment], remainingPathSegments, modification, value)
        );
    }

    if (isRecord(current) && typeof pathSegment === 'string') {
        return setRecordValue(
            current,
            pathSegment,
            updateNestedValue(current[pathSegment], remainingPathSegments, modification, value)
        );
    }

    return current;
}

function cloneWithModification(
    data: Record<string, unknown>,
    path: string,
    modification: 'delete' | 'set',
    value?: unknown
): unknown {
    return updateNestedValue(structuredClone(data), parsePath(path), modification, value);
}

function getExpectedIssuesForFieldType(options: {
    readonly path: string;
    readonly expectedFieldType: string;
    readonly assertedType: 'null' | 'number' | 'object' | 'undefined';
}): readonly [string, ...string[]] {
    const path = pathDotNotationToBracketNotation(options.path);

    if (!['object', 'string', 'number', 'boolean', 'array', 'record', 'tuple'].includes(options.expectedFieldType)) {
        return [`at ${path}: invalid literal: expected ${options.expectedFieldType}, but got ${options.assertedType}`];
    }

    return [`at ${path}: expected ${options.expectedFieldType}, but got ${options.assertedType}`];
}

function createRequiredMissingFieldValidation(options: FieldTestOptions, expectedPath: string): Func {
    return checkValidationFailure({
        schema: options.schema,
        data: cloneWithModification(options.data, options.path, 'delete'),
        expectedMessages: [`at ${expectedPath}: missing property`]
    });
}

function createOptionalMissingFieldValidation(options: FieldTestOptions): Func {
    return checkValidationSuccess({
        schema: options.schema,
        data: cloneWithModification(options.data, options.path, 'delete'),
        expectedData: cloneWithModification(options.data, options.path, 'delete')
    });
}

function createRequiredUndefinedFieldValidation(options: FieldTestOptions): Func {
    return checkValidationFailure({
        schema: options.schema,
        data: cloneWithModification(options.data, options.path, 'set'),
        expectedMessages: Array.from(
            getExpectedIssuesForFieldType({
                path: options.path,
                expectedFieldType: options.expectedFieldType,
                assertedType: 'undefined'
            })
        )
    });
}

function createOptionalUndefinedFieldValidation(options: FieldTestOptions): Func {
    return checkValidationSuccess({
        schema: options.schema,
        data: cloneWithModification(options.data, options.path, 'set'),
        expectedData: cloneWithModification(options.data, options.path, 'set')
    });
}

function createMissingFieldTest(options: FieldTestOptions, required: boolean): void {
    const expectedPath = pathDotNotationToBracketNotation(options.path);
    const validation = required
        ? createRequiredMissingFieldValidation(options, expectedPath)
        : createOptionalMissingFieldValidation(options);

    test(`validation ${required ? 'fails' : 'succeeds'} when ${options.path} is missing`, validation);
}

function createUndefinedFieldTest(options: FieldTestOptions, required: boolean): void {
    const validation = required
        ? createRequiredUndefinedFieldValidation(options)
        : createOptionalUndefinedFieldValidation(options);

    test(`validation ${required ? 'fails' : 'succeeds'} when ${options.path} is undefined`, validation);
}

function createNullFieldTest(options: FieldTestOptions): void {
    test(
        `validation fails when ${options.path} is null`,
        checkValidationFailure({
            schema: options.schema,
            data: cloneWithModification(options.data, options.path, 'set', null),
            expectedMessages: Array.from(
                getExpectedIssuesForFieldType({
                    path: options.path,
                    expectedFieldType: options.expectedFieldType,
                    assertedType: 'null'
                })
            )
        })
    );
}

function createWrongTypeFieldTest(options: FieldTestOptions): void {
    const expectsObjectLike = objectLikeFieldTypes.has(options.expectedFieldType);
    const wrongTypeValue = expectsObjectLike ? invalidNumberValue : {};
    const assertedType = expectsObjectLike ? 'number' : 'object';

    test(
        `validation fails when ${options.path} is not a ${options.expectedFieldType}`,
        checkValidationFailure({
            schema: options.schema,
            data: cloneWithModification(options.data, options.path, 'set', wrongTypeValue),
            expectedMessages: Array.from(
                getExpectedIssuesForFieldType({
                    path: options.path,
                    expectedFieldType: options.expectedFieldType,
                    assertedType
                })
            )
        })
    );
}

export function createTestCasesForRequiredField(options: FieldTestOptions): void {
    createMissingFieldTest(options, true);
    createUndefinedFieldTest(options, true);
    createNullFieldTest(options);
    createWrongTypeFieldTest(options);
}

export function createTestCasesForOptionalField(options: FieldTestOptions): void {
    createMissingFieldTest(options, false);
    createUndefinedFieldTest(options, false);
    createNullFieldTest(options);
    createWrongTypeFieldTest(options);
}
