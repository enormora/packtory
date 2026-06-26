import { FormattedZodError, formatZodError, type SafeParseResult } from '@schema-hub/zod-error-formatter';
import { z } from 'zod/v4-mini';
import type { $ZodIssue, $ZodType, output as TypeOf } from 'zod/v4/core';

type NonEmptyStringArray = readonly [string, ...(readonly string[])];
type PathSegment = PropertyKey;

function normalizeValidationIssue(issue: string): string {
    return issue
        .replaceAll(': Invalid input', ': invalid input')
        .replaceAll('no union alternative matched:', 'invalid value doesn’t match expected union')
        .replaceAll(/: missing property; expected [^;|]+/gu, ': missing property');
}

function formatPath(path: readonly PathSegment[]): string {
    return path
        .map((segment) => {
            return typeof segment === 'number' ? `[${segment}]` : `.${String(segment)}`;
        })
        .join('')
        .replace(/^\./u, '');
}

function formatPathPrefix(path: readonly PathSegment[]): string {
    const formattedPath = formatPath(path);
    return formattedPath.length === 0 ? '' : `at ${formattedPath}: `;
}

function valueAtPath(value: unknown, path: readonly PathSegment[]): unknown {
    let current = value;
    for (const segment of path) {
        current = Reflect.get(new Object(current), segment);
    }

    return current;
}

function formatExpectedValue(value: unknown): string {
    return typeof value === 'string' ? `"${value}"` : String(value);
}

function formatActualType(value: unknown): string {
    if (value === null) {
        return 'null';
    }

    if (Array.isArray(value)) {
        return 'array';
    }

    return typeof value;
}

function shouldUseGenericUnionIssue(issue: $ZodIssue, normalizedFallbackIssue: string): boolean {
    return (
        normalizedFallbackIssue === 'Invalid input' ||
        normalizedFallbackIssue.includes('invalid value doesn’t match expected union') ||
        (issue.path.length === 0 && normalizedFallbackIssue.startsWith('at '))
    );
}

function formatUnionIssue(issue: $ZodIssue, fallbackIssue: string): string {
    const normalizedFallbackIssue = normalizeValidationIssue(fallbackIssue);
    if (shouldUseGenericUnionIssue(issue, normalizedFallbackIssue)) {
        return `${formatPathPrefix(issue.path)}invalid value doesn’t match expected union`;
    }

    return normalizedFallbackIssue;
}

function formatInvalidValueIssue(
    issue: Extract<$ZodIssue, { readonly code: 'invalid_value' }>,
    input: unknown
): string {
    const actualValue = valueAtPath(input, issue.path);
    if (actualValue === undefined) {
        return `${formatPathPrefix(issue.path)}missing property`;
    }

    const [expectedValue] = issue.values;
    const expectedValueMessage = formatExpectedValue(expectedValue);
    const actualTypeMessage = formatActualType(actualValue);
    const issuePath = formatPathPrefix(issue.path);
    return `${issuePath}invalid literal: expected ${expectedValueMessage}, but got ${actualTypeMessage}`;
}

function formatStableIssue(issue: $ZodIssue, input: unknown, fallbackIssue: string): string | undefined {
    if (issue.code === 'invalid_union') {
        return formatUnionIssue(issue, fallbackIssue);
    }

    if (issue.code === 'invalid_key') {
        return `${formatPathPrefix(issue.path)}invalid key`;
    }

    return issue.code === 'invalid_value' ? formatInvalidValueIssue(issue, input) : undefined;
}

function normalizeIssues(
    issues: readonly $ZodIssue[],
    fallbackIssues: NonEmptyStringArray,
    value: unknown
): NonEmptyStringArray {
    const normalizedIssues = issues.map((issue, index) => {
        const fallbackIssue = String(fallbackIssues[index]);
        return formatStableIssue(issue, value, fallbackIssue) ?? normalizeValidationIssue(fallbackIssue);
    });

    return [String(normalizedIssues[0]), ...normalizedIssues.slice(1)];
}

export function safeParse<Schema extends $ZodType>(schema: Schema, value: unknown): SafeParseResult<TypeOf<Schema>> {
    const result = z.safeParse(schema, value);
    if (result.success) {
        return result;
    }

    const fallbackIssues = formatZodError(result.error, value).issues;
    return {
        success: false,
        error: new FormattedZodError(normalizeIssues(result.error.issues, fallbackIssues, value))
    };
}
