import { type NonEmptyReadonlyArray, map, flatMap, initNonEmpty, lastNonEmpty } from 'effect/ReadonlyArray';
import type { ParseIssue, UnionMember, Type, Key, Index } from '@effect/schema/ParseResult';
import { capitalize } from './capitalize.js';
import { formatAst, isBooleanLiteralUnion } from './formatting/ast.js';

function uniqueList<const T extends readonly unknown[]>(values: T): Readonly<T> {
    return Array.from(new Set(values)) as unknown as T;
}

type Path = readonly PropertyKey[];

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

type UnionWithTypeIssue = UnionMember & { errors: [Type] };
function isUnionTypeIssue(issue: ParseIssue): issue is UnionWithTypeIssue {
    const { _tag: tag } = issue;
    if (tag !== 'UnionMember') {
        return false;
    }
    if (issue.errors.length > 1) {
        return false;
    }
    const [firstIssue] = issue.errors;
    return firstIssue._tag === 'Type';
}
function isAllUnion(issues: NonEmptyReadonlyArray<ParseIssue>): issues is NonEmptyReadonlyArray<UnionWithTypeIssue> {
    return issues.every(isUnionTypeIssue);
}
function formatUnionIssues(issues: NonEmptyReadonlyArray<UnionWithTypeIssue>, path: Path): string {
    const expectedAsts = map(issues, (issue) => {
        return issue.errors[0].expected;
    });
    const list: NonEmptyReadonlyArray<string> = isBooleanLiteralUnion(expectedAsts)
        ? ['boolean']
        : flatMap(expectedAsts, formatAst);

    return formatMessageWithPath(path, formatMessage(list, issues[0].errors[0].actual));
}

const simpleMessages = {
    Missing: 'missing key or index',
    Forbidden: 'forbidden',
    Unexpected: 'unexpected extra key or index'
} as const;
type SimpleIssue = Extract<ParseIssue, { _tag: keyof typeof simpleMessages }>;

function isSimpleIssue(parseIssue: ParseIssue): parseIssue is SimpleIssue {
    const { _tag: tag } = parseIssue;
    return Object.hasOwn(simpleMessages, tag);
}

function formatSimpleIssue(parseIssue: SimpleIssue, path: Path): NonEmptyReadonlyArray<string> {
    const { _tag: tag } = parseIssue;
    return [formatMessageWithPath(path, simpleMessages[tag])];
}

function isContainerIssue(parseIssue: ParseIssue): parseIssue is Index | Key {
    const { _tag: tag } = parseIssue;
    return ['Key', 'Index'].includes(tag);
}

function formatContainerIssue(issue: Index | Key, path: Path): NonEmptyReadonlyArray<string> {
    const { _tag: tag } = issue;
    const newPathItem = tag === 'Key' ? issue.key : issue.index;
    const newPath = [...path, newPathItem];

    // eslint-disable-next-line @typescript-eslint/no-use-before-define -- indirect recursion
    return formatAllWithPath(issue.errors, newPath);
}

function format(parseIssue: ParseIssue, path: Path): NonEmptyReadonlyArray<string> {
    if (isSimpleIssue(parseIssue)) {
        return formatSimpleIssue(parseIssue, path);
    }

    if (isContainerIssue(parseIssue)) {
        return formatContainerIssue(parseIssue, path);
    }

    const { _tag: tag } = parseIssue;

    if (tag === 'UnionMember') {
        return flatMap(parseIssue.errors, (error) => {
            return format(error, path);
        });
    }

    return [formatMessageWithPath(path, formatMessage(formatAst(parseIssue.expected), parseIssue.actual))];
}

function formatAllWithPath(parseIssues: NonEmptyReadonlyArray<ParseIssue>, path: Path): NonEmptyReadonlyArray<string> {
    if (isAllUnion(parseIssues)) {
        return [formatUnionIssues(parseIssues, path)];
    }

    return flatMap(parseIssues, (parseIssue) => {
        return format(parseIssue, path);
    });
}

export function formatAllParseIssues(parseIssues: NonEmptyReadonlyArray<ParseIssue>): NonEmptyReadonlyArray<string> {
    return uniqueList(formatAllWithPath(parseIssues, []));
}
