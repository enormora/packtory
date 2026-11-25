import { constant } from 'remeda';
import { match } from 'ts-pattern';
import { Node as TypeScriptMorphNode, SyntaxKind, type Expression } from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { constantInitializer } from './constant-binding.ts';
import { maximumEvaluationDepth } from './evaluation-context.ts';
import { bindingDeclarationsOf, resolvesToGlobal } from './global-reference.ts';

export type GlobalPath = readonly (string | undefined)[];

export type PropertyKeyEvaluator = (expression: Expression) => string | undefined;

type PathResolution = {
    readonly resolvePath: (expression: Expression, depth: number) => GlobalPath | undefined;
    readonly evaluateKey: PropertyKeyEvaluator;
};

type PathRule = (expression: Expression, depth: number, resolution: PathResolution) => GlobalPath | undefined;

const globalObjectNames: ReadonlySet<string | undefined> = new Set([ 'globalThis', 'global', 'self', 'window' ]);

function memberPath(base: GlobalPath | undefined, key: string | undefined): GlobalPath | undefined {
    if (base === undefined) {
        return undefined;
    }
    return base.length === 0 && globalObjectNames.has(key) ? base : [ ...base, key ];
}

function wellKnownSymbolKey(path: GlobalPath | undefined): string | undefined {
    if (path === undefined) {
        return undefined;
    }
    const [ owner, name, ...rest ] = path;
    return owner === 'Symbol' && rest.length === 0 ? `@@${String(name)}` : undefined;
}

function propertyKeyAt(expression: Expression, depth: number, resolution: PathResolution): string | undefined {
    return wellKnownSymbolKey(resolution.resolvePath(expression, depth)) ?? resolution.evaluateKey(expression);
}

function aliasInitializer(expression: Expression): Expression | undefined {
    const identifier = expression.asKindOrThrow(SyntaxKind.Identifier);
    const [ declaration ] = bindingDeclarationsOf(identifier);
    return TypeScriptMorphNode.isVariableDeclaration(declaration) ? constantInitializer(declaration) : undefined;
}

function identifierPath(expression: Expression, depth: number, resolution: PathResolution): GlobalPath | undefined {
    if (resolvesToGlobal(expression.asKindOrThrow(SyntaxKind.Identifier))) {
        return memberPath([], expression.getText());
    }
    const initializer = aliasInitializer(expression);
    return initializer === undefined ? undefined : resolution.resolvePath(initializer, depth);
}

function propertyAccessPath(expression: Expression, depth: number, resolution: PathResolution): GlobalPath | undefined {
    const access = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
    return memberPath(resolution.resolvePath(access.getExpression(), depth), access.getName());
}

function elementAccessPath(expression: Expression, depth: number, resolution: PathResolution): GlobalPath | undefined {
    const access = expression.asKindOrThrow(SyntaxKind.ElementAccessExpression);
    return memberPath(
        resolution.resolvePath(access.getExpression(), depth),
        propertyKeyAt(access.getArgumentExpressionOrThrow(), depth, resolution)
    );
}

function sequenceResultPath(expression: Expression, depth: number, resolution: PathResolution): GlobalPath | undefined {
    const binary = expression.asKindOrThrow(SyntaxKind.BinaryExpression);
    return binary.getOperatorToken().getKind() === SyntaxKind.CommaToken
        ? resolution.resolvePath(binary.getRight(), depth)
        : undefined;
}

function pathRuleFor(kind: SyntaxKind): PathRule | undefined {
    return match<number>(kind)
        .with(SyntaxKind.Identifier, constant(identifierPath))
        .with(SyntaxKind.PropertyAccessExpression, constant(propertyAccessPath))
        .with(SyntaxKind.ElementAccessExpression, constant(elementAccessPath))
        .with(SyntaxKind.BinaryExpression, constant(sequenceResultPath))
        .otherwise(constant(undefined));
}

function createPathResolution(evaluateKey: PropertyKeyEvaluator): PathResolution {
    const resolution: PathResolution = {
        evaluateKey,
        resolvePath(expression, depth) {
            if (depth > maximumEvaluationDepth) {
                return undefined;
            }
            const unwrapped = unwrapExpression(expression);
            return pathRuleFor(unwrapped.getKind())?.(unwrapped, depth + 1, resolution);
        }
    };
    return resolution;
}

export function globalPathOf(expression: Expression, evaluateKey: PropertyKeyEvaluator): GlobalPath | undefined {
    return createPathResolution(evaluateKey).resolvePath(expression, 0);
}

export function globalPropertyKeyOf(expression: Expression, evaluateKey: PropertyKeyEvaluator): string | undefined {
    return propertyKeyAt(expression, 0, createPathResolution(evaluateKey));
}
