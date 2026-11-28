import {
    Node as TypeScriptMorphNode,
    type Expression,
    type Identifier,
    type ObjectBindingPattern,
    type VariableDeclaration
} from 'ts-morph';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { constantStatement } from '../evaluation/constant-binding.ts';
import { expressionWithWrappers, unwrapExpression } from '../expression-unwrapping.ts';
import { callObservesReceiver } from '../receiver-call.ts';
import { numericLiteralValue } from '../evaluation/primitive-value.ts';
import { staticPropertyName } from '../liveness/builder-return.ts';

export type CalledNamespaceProperties = ((name: string) => ReadonlySet<string> | undefined) | undefined;

type NamespaceObservation = {
    readonly calledProperties: CalledNamespaceProperties;
    readonly references: (name: Identifier, declaration: VariableDeclaration) => readonly Identifier[];
    readonly recordProperty: (key: string) => void;
    readonly enterBinding: (declaration: VariableDeclaration) => boolean;
    readonly observe: (value: Expression) => boolean;
};

function recordProperty(property: Expression, key: string, observation: NamespaceObservation): boolean {
    const expression = expressionWithWrappers(property);
    if (callObservesReceiver(expression)) {
        const properties = observation.calledProperties?.(key);
        if (properties === undefined) {
            return false;
        }
        for (const observedKey of properties) {
            observation.recordProperty(observedKey);
        }
    }
    observation.recordProperty(key);
    return true;
}

function observeObjectBinding(pattern: ObjectBindingPattern, observation: NamespaceObservation): boolean {
    return pattern.getElements().every(function (element) {
        const key = staticPropertyName(element);
        if (key === undefined || element.getDotDotDotToken() !== undefined) {
            return false;
        }
        observation.recordProperty(key);
        return true;
    });
}

function observeNamespaceAlias(
    name: Identifier,
    declaration: VariableDeclaration,
    observation: NamespaceObservation
): boolean {
    const references = observation.references(name, declaration);
    return references.every(function (reference) {
        return observation.observe(reference);
    }) && bindingHasOnlyUses(name, declaration, new Set(references));
}

function observeBinding(declaration: VariableDeclaration, observation: NamespaceObservation): boolean {
    if (!observation.enterBinding(declaration)) {
        return true;
    }
    const statement = constantStatement(declaration);
    if (statement === undefined || statement.hasExportKeyword()) {
        return false;
    }
    const name = declaration.getNameNode();
    return TypeScriptMorphNode.isIdentifier(name)
        ? observeNamespaceAlias(name, declaration, observation)
        : TypeScriptMorphNode.isObjectBindingPattern(name) && observeObjectBinding(name, observation);
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
    const expression = expressionWithWrappers(value);
    const parent = expression.getParent();
    return observeProperty(expression, observation) ?? (
        TypeScriptMorphNode.isVariableDeclaration(parent) && parent.getInitializer() === expression
            ? observeBinding(parent, observation)
            : TypeScriptMorphNode.isExpressionStatement(parent)
    );
}

type NamespaceReadObservation = {
    readonly properties: ReadonlySet<string>;
    readonly observe: (value: Expression) => boolean;
};

export function createNamespaceReadObservation(
    references: NamespaceObservation['references'],
    calledProperties: CalledNamespaceProperties
): NamespaceReadObservation {
    let complete = true;
    const properties = new Set<string>();
    const visited = new Set<VariableDeclaration>();
    const observation: NamespaceObservation = {
        references,
        calledProperties,
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
    return {
        properties,
        observe(value) {
            complete = complete && observation.observe(value);
            return complete;
        }
    };
}
