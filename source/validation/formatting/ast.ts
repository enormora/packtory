import * as Option from 'effect/Option';
import { type NonEmptyReadonlyArray, map, isNonEmptyReadonlyArray, flatMap } from 'effect/ReadonlyArray';
import {
    type AST,
    getIdentifierAnnotation,
    getTitleAnnotation,
    getDescriptionAnnotation,
    isLiteral,
    type TemplateLiteralSpan,
    type LiteralValue
} from '@effect/schema/AST';

function getNameFromAnnotation(ast: AST, fallback: string): string {
    return getIdentifierAnnotation(ast).pipe(
        Option.orElse(() => {
            return getTitleAnnotation(ast);
        }),
        Option.orElse(() => {
            return getDescriptionAnnotation(ast);
        }),
        Option.getOrElse(() => {
            return fallback;
        })
    );
}

const astTypeToFormattedType = {
    TypeLiteral: 'object',
    Tuple: 'array',
    StringKeyword: 'string',
    NumberKeyword: 'number',
    BooleanKeyword: 'boolean',
    UndefinedKeyword: 'undefined',
    NeverKeyword: 'never',
    UnknownKeyword: 'unknown',
    AnyKeyword: 'any',
    BigIntKeyword: 'bigint',
    VoidKeyword: 'void',
    UniqueSymbol: 'symbol',
    SymbolKeyword: 'symbol',
    ObjectKeyword: 'object'
} as const;

type Tuple<
    Element,
    Size extends number,
    CurrentList extends readonly Element[] = []
> = CurrentList['length'] extends Size ? CurrentList : Tuple<Element, Size, readonly [Element, ...CurrentList]>;
function isTupleOfLength<Element, Length extends number>(
    list: readonly Element[],
    length: Length
): list is Tuple<Element, Length> {
    return list.length === length;
}

function isLiteralValue(type: AST, expectedValue: LiteralValue): boolean {
    return isLiteral(type) && type.literal === expectedValue;
}

export function isBooleanLiteralUnion(types: readonly AST[]): boolean {
    const amountOfMembersInBooleanLiteralUnion = 2;
    if (!isTupleOfLength(types, amountOfMembersInBooleanLiteralUnion)) {
        return false;
    }
    const [firstType, secondType] = types;

    const isTrueOrFalse = isLiteralValue(firstType, true) && isLiteralValue(secondType, false);
    const isFalseOrTrue = isLiteralValue(firstType, false) && isLiteralValue(secondType, true);

    return isTrueOrFalse || isFalseOrTrue;
}

function formatTemplateLiteralSpan(span: TemplateLiteralSpan): string {
    const { _tag: tag } = span.type;
    const formattedType = astTypeToFormattedType[tag];

    return `\${${formattedType}}${span.literal}`;
}

function formatTemplateLiteralSpans(head: string, spans: NonEmptyReadonlyArray<TemplateLiteralSpan>): string {
    const formattedSpans = spans.map(formatTemplateLiteralSpan);
    return `${head}${formattedSpans.join('')}`;
}

type SimpleFormatters = keyof typeof astTypeToFormattedType;
type DynamicFormatters = Exclude<AST['_tag'], SimpleFormatters>;

type DynamicFormatFunction<Tag extends DynamicFormatters> = (
    ast: Extract<AST, { _tag: Tag }>
) => NonEmptyReadonlyArray<string>;

type TagToFormatterMap = {
    readonly [Key in DynamicFormatters]: DynamicFormatFunction<Key>;
} & {
    readonly [Key in SimpleFormatters]: typeof formatSimpleAst;
};

function formatSimpleAst(ast: Extract<AST, { _tag: SimpleFormatters }>): NonEmptyReadonlyArray<string> {
    const { _tag: tag } = ast;
    return [astTypeToFormattedType[tag]];
}

const formatters: TagToFormatterMap = {
    Declaration(ast) {
        return [getNameFromAnnotation(ast, '<anonymous declaration schema>')];
    },
    Literal(ast) {
        return [JSON.stringify(ast.literal)];
    },
    Transform(ast) {
        return [getNameFromAnnotation(ast, '<anonymous transform schema>')];
    },
    Union(ast) {
        if (isBooleanLiteralUnion(ast.types)) {
            return ['boolean'];
        }
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- indirect recursion
        return flatMap(ast.types, formatAst);
    },
    Enums(ast) {
        if (isNonEmptyReadonlyArray(ast.enums)) {
            return map(ast.enums, (value) => {
                return JSON.stringify(value);
            });
        }
        return ['empty enum'];
    },
    TemplateLiteral(ast) {
        return [formatTemplateLiteralSpans(ast.head, ast.spans)];
    },
    Refinement(ast) {
        return [getNameFromAnnotation(ast, '<anonymous refinement schema>')];
    },
    Suspend(ast) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- indirect recursion
        return formatAst(ast.f());
    },
    TypeLiteral: formatSimpleAst,
    Tuple: formatSimpleAst,
    StringKeyword: formatSimpleAst,
    NumberKeyword: formatSimpleAst,
    BooleanKeyword: formatSimpleAst,
    UndefinedKeyword: formatSimpleAst,
    NeverKeyword: formatSimpleAst,
    UnknownKeyword: formatSimpleAst,
    AnyKeyword: formatSimpleAst,
    BigIntKeyword: formatSimpleAst,
    VoidKeyword: formatSimpleAst,
    UniqueSymbol: formatSimpleAst,
    SymbolKeyword: formatSimpleAst,
    ObjectKeyword: formatSimpleAst
};

export function formatAst(ast: AST): NonEmptyReadonlyArray<string> {
    const { _tag: tag } = ast;

    const formatter = formatters[tag] as (ast: AST) => NonEmptyReadonlyArray<string>;
    return formatter(ast);
}
