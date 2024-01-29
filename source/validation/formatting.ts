import { type NonEmptyReadonlyArray, map, flatMap, initNonEmpty, lastNonEmpty } from 'effect/ReadonlyArray';
import type { ParseIssue, Type, Key, Index, Tuple, TypeLiteral, ParseError, Union } from '@effect/schema/ParseResult';
import { capitalize } from './capitalize.js';
import { formatAst, isBooleanLiteralUnion } from './formatting/ast.js';

function uniqueList<const T extends readonly unknown[]>(values: T): Readonly<T> {
    return Array.from(new Set(values)) as unknown as T;
}

type Path = readonly PropertyKey[];

function hasTag<TaggedValue extends { _tag: string }, Tag extends string>(
    value: TaggedValue,
    expectedTag: Tag
): value is Extract<TaggedValue, { _tag: Tag }> {
    const { _tag: tag } = value;
    return tag === expectedTag;
}

function formatOneOrMany(values: NonEmptyReadonlyArray<string>): string {
    const uniqueValues = uniqueList(values);
    const last = lastNonEmpty(uniqueValues);
    const init = initNonEmpty(uniqueValues);

    if (init.length > 0) {
        return `one of ${init.join(', ')} or ${last}`;
    }

    return last;
}

function formatActual(value: unknown): string {
    if (Array.isArray(value)) {
        return 'array';
    }
    if (value === null) {
        return 'null';
    }
    return typeof value;
}

function formatMessageWithPath(path: Path, message: string): string {
    if (path.length > 0) {
        const formattedPath = path.join('.');
        return `At ${formattedPath}: ${message}`;
    }

    return capitalize(message);
}

function formatMessage(expected: NonEmptyReadonlyArray<string>, actual: unknown): string {
    return `expected ${formatOneOrMany(expected)}; but got ${formatActual(actual)}`;
}

function isTypeIssue(issue: ParseIssue): issue is Type {
    return hasTag(issue, 'Type');
}

function formatUnionIssues(issues: Union['errors'], path: Path): NonEmptyReadonlyArray<string> {
    const parseIssues = map(issues, (issue) => {
        if (hasTag(issue, 'Member')) {
            return issue.error;
        }
        return issue;
    });

    if (parseIssues.every(isTypeIssue)) {
        const expectedAsts = map(parseIssues, (issue) => {
            return issue.ast;
        });
        const list: NonEmptyReadonlyArray<string> = isBooleanLiteralUnion(expectedAsts)
            ? ['boolean']
            : flatMap(expectedAsts, formatAst);

        return [formatMessageWithPath(path, formatMessage(list, parseIssues[0].actual))];
    }

    return flatMap(parseIssues, (issue) => {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- indirect recursion
        return format(issue, path);
    });
}

function isContainerIssue(parseIssue: ParseIssue): parseIssue is Tuple | TypeLiteral {
    return hasTag(parseIssue, 'Tuple') || hasTag(parseIssue, 'TypeLiteral');
}

function formatContainerIssue(issue: Index | Key, path: Path): NonEmptyReadonlyArray<string> {
    const newPathItem = hasTag(issue, 'Key') ? issue.key : issue.index;
    const newPath = [...path, newPathItem];

    if (hasTag(issue.error, 'Missing')) {
        return [formatMessageWithPath(newPath, 'missing key or index')];
    }

    if (hasTag(issue.error, 'Unexpected')) {
        return [formatMessageWithPath(newPath, 'unexpected extra key or index')];
    }

    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- indirect recursion
    return format(issue.error, newPath);
}

function format(parseIssue: ParseIssue, path: Path): NonEmptyReadonlyArray<string> {
    if (hasTag(parseIssue, 'Refinement') || hasTag(parseIssue, 'Transform')) {
        return format(parseIssue.error, path);
    }

    if (hasTag(parseIssue, 'Forbidden')) {
        return [formatMessageWithPath(path, 'forbidden')];
    }

    if (isContainerIssue(parseIssue)) {
        return flatMap(parseIssue.errors, (error: Index | Key) => {
            return formatContainerIssue(error, path);
        });
    }

    if (hasTag(parseIssue, 'Union')) {
        return formatUnionIssues(parseIssue.errors, path);
    }

    return [formatMessageWithPath(path, formatMessage(formatAst(parseIssue.ast), parseIssue.actual))];
}

export function formatAllParseIssues(parseError: ParseError): NonEmptyReadonlyArray<string> {
    return uniqueList(format(parseError.error, []));
}
