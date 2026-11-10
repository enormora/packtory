import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CallExpression,
    type Expression,
    type SourceFile,
    type VariableDeclaration
} from 'ts-morph';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { constantStatement } from '../evaluation/constant-binding.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { numericLiteralValue } from '../evaluation/primitive-value.ts';

type NamespaceObservation = {
    readonly recordProperty: (key: string) => void;
    readonly enterBinding: (declaration: VariableDeclaration) => boolean;
    readonly observe: (value: Expression) => boolean;
};

function enclosingExpression(expression: Expression): Expression {
    const parent = expression.getParent();
    return TypeScriptMorphNode.isExpression(parent) && unwrapExpression(parent) === unwrapExpression(expression)
        ? enclosingExpression(parent)
        : expression;
}

function recordProperty(property: Expression, key: string, observation: NamespaceObservation): boolean {
    const expression = enclosingExpression(property);
    const parent = expression.getParent();
    if (
        TypeScriptMorphNode.isCallExpression(parent) && parent.getExpression() === expression ||
        TypeScriptMorphNode.isTaggedTemplateExpression(parent) && parent.getTag() === expression
    ) {
        return false;
    }
    observation.recordProperty(key);
    return true;
}

function observeBinding(declaration: VariableDeclaration, observation: NamespaceObservation): boolean {
    if (!observation.enterBinding(declaration)) {
        return true;
    }
    const statement = constantStatement(declaration);
    const name = declaration.getNameNode();
    if (statement === undefined || statement.isExported() || !TypeScriptMorphNode.isIdentifier(name)) {
        return false;
    }
    const references = declaration.getSourceFile().getDescendantsOfKind(SyntaxKind.Identifier).filter(
        function (reference) {
            return reference !== name && reference.getSymbol()?.getDeclarations().includes(declaration) === true;
        }
    );
    return references.every(function (reference) {
        return observation.observe(reference);
    }) && bindingHasOnlyUses(name, declaration, new Set(references));
}

function observeElement(
    expression: Expression,
    key: Expression | undefined,
    observation: NamespaceObservation
): boolean {
    const literal = unwrapExpression(key);
    if (TypeScriptMorphNode.isNumericLiteral(literal)) {
        return recordProperty(expression, String(numericLiteralValue(literal)), observation);
    }
    return (
        TypeScriptMorphNode.isStringLiteral(literal) ||
        TypeScriptMorphNode.isNoSubstitutionTemplateLiteral(literal)
    ) && recordProperty(expression, literal.getLiteralValue(), observation);
}

function observeProperty(expression: Expression, observation: NamespaceObservation): boolean | undefined {
    const parent = expression.getParent();
    if (TypeScriptMorphNode.isPropertyAccessExpression(parent) && parent.getExpression() === expression) {
        return recordProperty(parent, parent.getNameNode().compilerNode.text, observation);
    }
    if (TypeScriptMorphNode.isElementAccessExpression(parent) && parent.getExpression() === expression) {
        return observeElement(parent, parent.getArgumentExpression(), observation);
    }
    return undefined;
}

function observeNamespace(value: Expression, observation: NamespaceObservation): boolean {
    const expression = enclosingExpression(value);
    const parent = expression.getParent();
    return observeProperty(expression, observation) ?? (
        TypeScriptMorphNode.isVariableDeclaration(parent) && parent.getInitializer() === expression
            ? observeBinding(parent, observation)
            : TypeScriptMorphNode.isExpressionStatement(parent)
    );
}

function namespaceMayResolveAnotherValue(target: SourceFile): boolean {
    return target.getExportSymbols().some(function (symbol) {
        return symbol.getName() === 'then';
    }) || target.getExportDeclarations().some(function (declaration) {
        return declaration.getModuleSpecifierValue() !== undefined;
    });
}

export function dynamicImportProperties(call: CallExpression, target: SourceFile): ReadonlySet<string> | undefined {
    const parent = enclosingExpression(call).getParent();
    if (
        !TypeScriptMorphNode.isAwaitExpression(parent) || hasDynamicScope(call.getSourceFile()) ||
        namespaceMayResolveAnotherValue(target)
    ) {
        return undefined;
    }
    const properties = new Set<string>();
    const visited = new Set<VariableDeclaration>();
    const observation: NamespaceObservation = {
        recordProperty(key) {
            properties.add(key);
        },
        enterBinding(declaration) {
            if (visited.has(declaration)) {
                return false;
            }
            visited.add(declaration);
            return true;
        },
        observe(value) {
            return observeNamespace(value, observation);
        }
    };
    return observation.observe(parent) ? properties : undefined;
}
