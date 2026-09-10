import {
    Node as TsMorphNode,
    SyntaxKind,
    type Expression,
    type PropertyName,
    type ShorthandPropertyAssignment
} from 'ts-morph';
import type { DeadCodeEliminationSettings } from '../config/dead-code-elimination-settings.ts';
import { declarationConstant, type ConstantBindingResolution } from './constant-binding.ts';
import {
    childExpressionContext,
    noActiveContext,
    type ConstantContext
} from './constant-context.ts';
import {
    arrayConstant,
    bigintConstant,
    binaryConstantValue,
    booleanConstant,
    isDataPrimitive,
    nullConstant,
    numberConstant,
    objectConstant,
    primitiveRawValue,
    propertyKeyFromConstant,
    propertyValue,
    rawIsFalsy,
    stringConstant,
    symbolConstant,
    unaryConstantValue,
    undefinedConstant,
    type ConstantPropertyKey,
    type ConstantValue,
    type PrimitiveRaw
} from './constant-value.ts';
import { unwrapExpression } from './expression-unwrapping.ts';
import { moduleGraphHasSideEffects } from './constant-module-guard.ts';
import { exportedConstantForOrigin, type ConstantSummaryDependencies } from './exported-constant-summary.ts';
import {
    resolveImportedExpressionOrigin,
    resolveImportedExpressionPath,
    type ImportedExpressionOrigin
} from './imported-expression-origin.ts';

type ObjectPropertyNode = ReturnType<TsMorphNode['getChildAtIndex']>;

type ConstantExpressionReader = {
    readonly arrayElementValue: (element: Expression) => ConstantValue | undefined;
    readonly arrayValue: (expression: Expression) => ConstantValue | undefined;
    readonly bigintLiteralValue: (expression: Expression) => ConstantValue | undefined;
    readonly binaryValue: (expression: Expression) => ConstantValue | undefined;
    readonly bindingResolution: () => ConstantBindingResolution;
    readonly computedPropertyNameKey: (expression: Expression) => string | undefined;
    readonly constantDependencies: (origin: ImportedExpressionOrigin) => ConstantSummaryDependencies;
    readonly identifierValue: (expression: Expression) => ConstantValue | undefined;
    readonly importedIdentifierValue: (expression: Expression) => ConstantValue | undefined;
    readonly importedPropertyAccessValue: (expression: Expression) => ConstantValue | undefined;
    readonly indexedPropertyValue: (expression: Expression) => ConstantValue | undefined;
    readonly keywordLiteralValue: (expression: Expression) => ConstantValue | undefined;
    readonly literalValue: (expression: Expression) => ConstantValue | undefined;
    readonly localIdentifierValue: (expression: Expression) => ConstantValue | undefined;
    readonly localPropertyAccessValue: (expression: Expression) => ConstantValue | undefined;
    readonly moduleSpecifierIsRelative: (moduleSpecifier: string) => boolean;
    readonly namedPropertyValue: (expression: Expression) => ConstantValue | undefined;
    readonly nullishShortCircuitValue: (
        operator: SyntaxKind,
        raw: PrimitiveRaw,
        left: ConstantValue
    ) => ConstantValue | undefined;
    readonly numericLiteralValue: (expression: Expression) => ConstantValue | undefined;
    readonly objectPropertyEntry: (property: ObjectPropertyNode) => readonly [string, ConstantValue] | undefined;
    readonly objectValue: (expression: Expression) => ConstantValue | undefined;
    readonly operatorReturnsRight: (operator: SyntaxKind) => boolean;
    readonly propertyAccessValue: (expression: Expression) => ConstantValue | undefined;
    readonly propertyAssignmentEntry: (property: ObjectPropertyNode) => readonly [string, ConstantValue] | undefined;
    readonly propertyKeyValue: (expression: Expression) => ConstantPropertyKey | undefined;
    readonly propertyNameKey: (name: PropertyName) => string | undefined;
    readonly resolvedBinaryValue: (
        operator: SyntaxKind,
        left: ConstantValue,
        right: ConstantValue | undefined
    ) => ConstantValue | undefined;
    readonly rightBinaryValue: (expression: Expression) => ConstantValue | undefined;
    readonly shorthandPropertyValue: (property: ObjectPropertyNode) => ConstantValue | undefined;
    readonly shortCircuitValue: (operator: SyntaxKind, left: ConstantValue) => ConstantValue | undefined;
    readonly stringValueForTemplateSpan: (expression: Expression) => string | undefined;
    readonly symbolCallValue: (expression: Expression) => ConstantValue | undefined;
    readonly templateValue: (expression: Expression) => ConstantValue | undefined;
    readonly textLiteralValue: (expression: Expression) => ConstantValue | undefined;
    readonly unaryValue: (expression: Expression) => ConstantValue | undefined;
    readonly uncheckedValue: (expression: Expression) => ConstantValue | undefined;
    readonly value: (expression: Expression) => ConstantValue | undefined;
};

const rightReturningOperators = new Set<SyntaxKind>([
    SyntaxKind.AmpersandAmpersandToken,
    SyntaxKind.BarBarToken,
    SyntaxKind.QuestionQuestionToken
]);

function shorthandPropertyIsSupported(property: ObjectPropertyNode): property is ShorthandPropertyAssignment {
    return TsMorphNode.isShorthandPropertyAssignment(property) &&
        property.getObjectAssignmentInitializer() === undefined;
}

function constantExpressionReader(context: ConstantContext): ConstantExpressionReader {
    const reader: ConstantExpressionReader = {
        arrayElementValue(element) {
            if (TsMorphNode.isSpreadElement(element)) {
                return undefined;
            }
            return TsMorphNode.isOmittedExpression(element) ? undefinedConstant() : reader.value(element);
        },
        arrayValue(expression) {
            if (!TsMorphNode.isArrayLiteralExpression(expression)) {
                return undefined;
            }
            const items: ConstantValue[] = [];
            for (const element of expression.getElements()) {
                const value = reader.arrayElementValue(element);
                if (value === undefined) {
                    return undefined;
                }
                items.push(value);
            }
            return arrayConstant(items);
        },
        bigintLiteralValue(expression) {
            return TsMorphNode.isBigIntLiteral(expression)
                ? bigintConstant(BigInt(expression.getLiteralText().replace(/n$/u, '')))
                : undefined;
        },
        binaryValue(expression) {
            if (!TsMorphNode.isBinaryExpression(expression)) {
                return undefined;
            }
            const left = reader.value(expression.getLeft());
            if (left === undefined || !isDataPrimitive(left)) {
                return undefined;
            }
            const operator = expression.getOperatorToken().getKind();
            const shortCircuit = reader.shortCircuitValue(operator, left);
            const right = shortCircuit === undefined ? reader.rightBinaryValue(expression) : undefined;
            return shortCircuit ?? reader.resolvedBinaryValue(operator, left, right);
        },
        bindingResolution() {
            return {
                context,
                evaluate(expression, nextContext) {
                    return constantExpressionReader(nextContext).value(expression);
                },
                propertyNameKey(name, nextContext) {
                    return constantExpressionReader(nextContext).propertyNameKey(name);
                }
            };
        },
        computedPropertyNameKey(expression) {
            const key = reader.propertyKeyValue(expression);
            return key?.type === 'string' ? key.value : undefined;
        },
        constantDependencies(origin) {
            const guardModuleSideEffects = !reader.moduleSpecifierIsRelative(origin.from);
            return {
                evaluate(expression, nextContext) {
                    return constantExpressionReader(nextContext).value(expression);
                },
                guardModuleSideEffects,
                moduleHasSideEffects(sourceFile, nextContext) {
                    return moduleGraphHasSideEffects(sourceFile, nextContext, {
                        constantValue(expression, guardContext) {
                            return constantExpressionReader(guardContext).value(expression);
                        }
                    });
                },
                propertyNameKey(name, nextContext) {
                    return constantExpressionReader(nextContext).propertyNameKey(name);
                }
            };
        },
        identifierValue(expression) {
            if (!TsMorphNode.isIdentifier(expression)) {
                return undefined;
            }
            if (expression.getText() === 'undefined') {
                return undefinedConstant();
            }
            return reader.importedIdentifierValue(expression) ?? reader.localIdentifierValue(expression);
        },
        importedIdentifierValue(expression) {
            const origin = resolveImportedExpressionPath(expression);
            return origin === undefined
                ? undefined
                : exportedConstantForOrigin(
                    origin,
                    expression.getSourceFile(),
                    context,
                    reader.constantDependencies(origin)
                );
        },
        importedPropertyAccessValue(expression) {
            const imported = resolveImportedExpressionOrigin(
                expression,
                function (candidate) {
                    return reader.value(candidate) !== undefined;
                },
                context.settings
            );
            return imported === undefined
                ? undefined
                : exportedConstantForOrigin(
                    imported,
                    expression.getSourceFile(),
                    context,
                    reader.constantDependencies(imported)
                );
        },
        indexedPropertyValue(expression) {
            if (!TsMorphNode.isElementAccessExpression(expression)) {
                return undefined;
            }
            const base = reader.value(expression.getExpression());
            const key = expression.getArgumentExpression();
            const propertyKey = key === undefined ? undefined : reader.propertyKeyValue(key);
            return base === undefined || propertyKey?.type !== 'string'
                ? undefined
                : propertyValue(base, propertyKey.value);
        },
        keywordLiteralValue(expression) {
            if (expression.getKind() === SyntaxKind.TrueKeyword) {
                return booleanConstant(true);
            }
            if (expression.getKind() === SyntaxKind.FalseKeyword) {
                return booleanConstant(false);
            }
            return expression.getKind() === SyntaxKind.NullKeyword ? nullConstant() : undefined;
        },
        literalValue(expression) {
            return reader.textLiteralValue(expression) ??
                reader.numericLiteralValue(expression) ??
                reader.keywordLiteralValue(expression) ??
                reader.bigintLiteralValue(expression);
        },
        localIdentifierValue(expression) {
            const declarations = expression.getSymbol()?.getDeclarations() ?? [];
            for (const declaration of declarations) {
                const value = declarationConstant(declaration, expression, reader.bindingResolution());
                if (value !== undefined) {
                    return value;
                }
            }
            return undefined;
        },
        localPropertyAccessValue(expression) {
            return reader.namedPropertyValue(expression) ?? reader.indexedPropertyValue(expression);
        },
        moduleSpecifierIsRelative(moduleSpecifier) {
            return moduleSpecifier.startsWith('.');
        },
        namedPropertyValue(expression) {
            if (!TsMorphNode.isPropertyAccessExpression(expression)) {
                return undefined;
            }
            const base = reader.value(expression.getExpression());
            return base === undefined ? undefined : propertyValue(base, expression.getName());
        },
        nullishShortCircuitValue(operator, raw, left) {
            return raw !== null && raw !== undefined && operator === SyntaxKind.QuestionQuestionToken
                ? left
                : undefined;
        },
        numericLiteralValue(expression) {
            return TsMorphNode.isNumericLiteral(expression)
                ? numberConstant(Number(expression.getLiteralText()))
                : undefined;
        },
        objectPropertyEntry(property) {
            if (TsMorphNode.isShorthandPropertyAssignment(property)) {
                const value = reader.shorthandPropertyValue(property);
                return value === undefined ? undefined : [ property.getName(), value ];
            }
            return reader.propertyAssignmentEntry(property);
        },
        objectValue(expression) {
            if (!TsMorphNode.isObjectLiteralExpression(expression)) {
                return undefined;
            }
            const properties = new Map<string, ConstantValue>();
            for (const property of expression.getProperties()) {
                const entry = reader.objectPropertyEntry(property);
                if (entry === undefined) {
                    return undefined;
                }
                properties.set(entry[0], entry[1]);
            }
            return objectConstant(properties);
        },
        operatorReturnsRight(operator) {
            return rightReturningOperators.has(operator);
        },
        propertyAccessValue(expression) {
            return reader.importedPropertyAccessValue(expression) ?? reader.localPropertyAccessValue(expression);
        },
        propertyAssignmentEntry(property) {
            if (!TsMorphNode.isPropertyAssignment(property)) {
                return undefined;
            }
            const key = reader.propertyNameKey(property.getNameNode());
            const value = reader.value(property.getInitializerOrThrow());
            return key === undefined || value === undefined ? undefined : [ key, value ];
        },
        propertyKeyValue(expression) {
            const value = reader.value(expression);
            return value === undefined ? undefined : propertyKeyFromConstant(value);
        },
        propertyNameKey(name) {
            if (TsMorphNode.isIdentifier(name)) {
                return name.getText();
            }
            if (TsMorphNode.isStringLiteral(name) || TsMorphNode.isNumericLiteral(name)) {
                return name.getLiteralText();
            }
            return TsMorphNode.isComputedPropertyName(name)
                ? reader.computedPropertyNameKey(name.getExpression())
                : undefined;
        },
        resolvedBinaryValue(operator, left, right) {
            if (right === undefined || !isDataPrimitive(left) || !isDataPrimitive(right)) {
                return undefined;
            }
            return reader.operatorReturnsRight(operator) ? right : binaryConstantValue(operator, left, right);
        },
        rightBinaryValue(expression) {
            const right = expression.asKindOrThrow(SyntaxKind.BinaryExpression).getRight();
            const value = reader.value(right);
            return value === undefined || !isDataPrimitive(value) ? undefined : value;
        },
        shorthandPropertyValue(property) {
            if (!shorthandPropertyIsSupported(property)) {
                return undefined;
            }
            const declarations = property.getValueSymbol()?.getDeclarations() ?? [];
            for (const declaration of declarations) {
                const value = declarationConstant(declaration, property, reader.bindingResolution());
                if (value !== undefined) {
                    return value;
                }
            }
            return undefined;
        },
        shortCircuitValue(operator, left) {
            const raw = primitiveRawValue(left);
            if (operator === SyntaxKind.AmpersandAmpersandToken && rawIsFalsy(raw)) {
                return left;
            }
            if (operator === SyntaxKind.BarBarToken && !rawIsFalsy(raw)) {
                return left;
            }
            return reader.nullishShortCircuitValue(operator, raw, left);
        },
        stringValueForTemplateSpan(expression) {
            const value = reader.value(expression);
            if (value?.type === 'undefined') {
                return 'undefined';
            }
            if (value === undefined || value.type === 'symbol' || !isDataPrimitive(value)) {
                return undefined;
            }
            return String(primitiveRawValue(value));
        },
        symbolCallValue(expression) {
            const unwrapped = unwrapExpression(expression);
            if (!TsMorphNode.isCallExpression(unwrapped)) {
                return undefined;
            }
            const callee = unwrapExpression(unwrapped.getExpression());
            const pureArguments = TsMorphNode.isIdentifier(callee) &&
                callee.getText() === 'Symbol' &&
                unwrapped.getArguments().every(function (argument) {
                    return TsMorphNode.isExpression(argument) && reader.value(argument) !== undefined;
                });
            return pureArguments ? symbolConstant() : undefined;
        },
        templateValue(expression) {
            if (!TsMorphNode.isTemplateExpression(expression)) {
                return undefined;
            }
            const parts = [ expression.getHead().getLiteralText() ];
            for (const span of expression.getTemplateSpans()) {
                const value = reader.stringValueForTemplateSpan(span.getExpression());
                if (value === undefined) {
                    return undefined;
                }
                parts.push(value, span.getLiteral().getLiteralText());
            }
            return stringConstant(parts.join(''));
        },
        textLiteralValue(expression) {
            return TsMorphNode.isStringLiteral(expression) || TsMorphNode.isNoSubstitutionTemplateLiteral(expression)
                ? stringConstant(expression.getLiteralText())
                : undefined;
        },
        unaryValue(expression) {
            if (!TsMorphNode.isPrefixUnaryExpression(expression)) {
                return undefined;
            }
            const value = reader.value(expression.getOperand());
            return value === undefined || !isDataPrimitive(value)
                ? undefined
                : unaryConstantValue(expression.getOperatorToken(), value);
        },
        uncheckedValue(expression) {
            const steps = [
                reader.symbolCallValue,
                reader.literalValue,
                reader.templateValue,
                reader.identifierValue,
                reader.propertyAccessValue,
                reader.arrayValue,
                reader.objectValue,
                reader.unaryValue,
                reader.binaryValue
            ];
            for (const step of steps) {
                const value = step(expression);
                if (value !== undefined) {
                    return value;
                }
            }
            return undefined;
        },
        value(expression) {
            const nextContext = childExpressionContext(context, expression);
            return nextContext === undefined
                ? undefined
                : constantExpressionReader(nextContext).uncheckedValue(unwrapExpression(expression));
        }
    };
    return reader;
}

export function constantValueOfExpression(
    expression: Expression,
    settings: DeadCodeEliminationSettings | undefined
): ConstantValue | undefined {
    return constantExpressionReader(noActiveContext(settings)).value(expression);
}

export function constantPropertyKeyOfExpression(
    expression: Expression,
    settings: DeadCodeEliminationSettings | undefined
): ConstantPropertyKey | undefined {
    return constantExpressionReader(noActiveContext(settings)).propertyKeyValue(expression);
}
