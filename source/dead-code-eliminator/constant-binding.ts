import {
    Node as TsMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type ArrayBindingPattern,
    type BindingElement,
    type Node as TsMorphNodeType,
    type ObjectBindingPattern,
    type PropertyName,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import type { ConstantContext, ExpressionConstantEvaluator } from './constant-context.ts';
import { propertyValue, type ConstantValue } from './constant-value.ts';
import { collectVariableDeclarationBindings } from './variable-declaration-bindings.ts';

type BindingNameNode = ReturnType<BindingElement['getNameNode']>;
type BindingEntry = readonly [string, ConstantValue];
export type PropertyNameKeyResolver = (name: PropertyName, context: ConstantContext) => string | undefined;

export type ConstantBindingResolution = {
    readonly context: ConstantContext;
    readonly evaluate: ExpressionConstantEvaluator;
    readonly propertyNameKey: PropertyNameKeyResolver;
};

type ChildBindingReader = (
    binding: BindingElement,
    source: ConstantValue | undefined
) => ConstantValue | undefined;

function variableStatementFor(declaration: VariableDeclaration): VariableStatement | undefined {
    return declaration.getFirstAncestorByKind(SyntaxKind.VariableStatement);
}

function declarationIsConst(declaration: VariableDeclaration): boolean {
    return variableStatementFor(declaration)?.getDeclarationKind() === VariableDeclarationKind.Const;
}

function declarationIsAvailable(declaration: VariableDeclaration, expression: TsMorphNodeType): boolean {
    const statement = variableStatementFor(declaration);
    return statement !== undefined && Math.sign(expression.getStart() - statement.getEnd()) === 1;
}

function bindingRootDeclaration(binding: BindingElement): VariableDeclaration {
    return binding.getFirstAncestorByKindOrThrow(SyntaxKind.VariableDeclaration);
}

function bindingElementIsSupported(binding: BindingElement): boolean {
    return binding.getInitializer() === undefined && binding.getDotDotDotToken() === undefined;
}

function bindingPropertyKey(
    binding: BindingElement,
    resolution: ConstantBindingResolution
): string | undefined {
    const propertyName = binding.getPropertyNameNode();
    if (propertyName !== undefined) {
        return resolution.propertyNameKey(propertyName, resolution.context);
    }
    const name = binding.getNameNode();
    return TsMorphNode.isIdentifier(name) ? name.getText() : undefined;
}

function supportedArrayBindingElements(pattern: ArrayBindingPattern): readonly (readonly [number, BindingElement])[] {
    return pattern.getElements().flatMap(function (element, index) {
        if (!TsMorphNode.isBindingElement(element) || !bindingElementIsSupported(element)) {
            return [];
        }
        return [ [ index, element ] ];
    });
}

function arrayElementValue(
    pattern: ArrayBindingPattern,
    source: ConstantValue,
    readChild: ChildBindingReader
): ConstantValue | undefined {
    if (source.type !== 'array') {
        return undefined;
    }
    for (const [ index, element ] of supportedArrayBindingElements(pattern)) {
        const result = readChild(element, source.items[index]);
        if (result !== undefined) {
            return result;
        }
    }
    return undefined;
}

function supportedObjectBindingElements(pattern: ObjectBindingPattern): readonly BindingElement[] {
    return pattern.getElements().filter(bindingElementIsSupported);
}

function objectElementValue(
    pattern: ObjectBindingPattern,
    source: ConstantValue,
    resolution: ConstantBindingResolution,
    readChild: ChildBindingReader
): ConstantValue | undefined {
    if (source.type !== 'object') {
        return undefined;
    }
    for (const element of supportedObjectBindingElements(pattern)) {
        const key = bindingPropertyKey(element, resolution);
        const result = readChild(element, key === undefined ? undefined : propertyValue(source, key));
        if (result !== undefined) {
            return result;
        }
    }
    return undefined;
}

function bindingNameValue(
    name: BindingNameNode,
    source: ConstantValue | undefined,
    resolution: ConstantBindingResolution,
    readChild: ChildBindingReader
): ConstantValue | undefined {
    if (source === undefined) {
        return undefined;
    }
    if (TsMorphNode.isArrayBindingPattern(name)) {
        return arrayElementValue(name, source, readChild);
    }
    if (TsMorphNode.isObjectBindingPattern(name)) {
        return objectElementValue(name, source, resolution, readChild);
    }
    return undefined;
}

function bindingValue(
    binding: BindingElement,
    target: BindingElement,
    source: ConstantValue | undefined,
    resolution: ConstantBindingResolution
): ConstantValue | undefined {
    const name = binding.getNameNode();
    if (source !== undefined && binding === target && TsMorphNode.isIdentifier(name)) {
        return source;
    }
    return bindingNameValue(name, source, resolution, function (child, childSource) {
        return bindingValue(child, target, childSource, resolution);
    });
}

function variableDeclarationConstant(
    declaration: VariableDeclaration,
    expression: TsMorphNodeType,
    resolution: ConstantBindingResolution
): ConstantValue | undefined {
    const name = declaration.getNameNode();
    const initializer = declaration.getInitializer();
    if (
        initializer === undefined ||
        !declarationIsConst(declaration) ||
        !declarationIsAvailable(declaration, expression) ||
        !TsMorphNode.isIdentifier(name)
    ) {
        return undefined;
    }
    return resolution.evaluate(initializer, resolution.context);
}

function bindingElementConstant(
    binding: BindingElement,
    expression: TsMorphNodeType,
    resolution: ConstantBindingResolution
): ConstantValue | undefined {
    const root = bindingRootDeclaration(binding);
    const initializer = root.getInitializer();
    if (
        initializer === undefined ||
        !declarationIsConst(root) ||
        !declarationIsAvailable(root, expression) ||
        !bindingElementIsSupported(binding)
    ) {
        return undefined;
    }
    return bindingNameValue(
        root.getNameNode(),
        resolution.evaluate(initializer, resolution.context),
        resolution,
        function (
            child,
            childSource
        ) {
            return bindingValue(child, binding, childSource, resolution);
        }
    );
}

export function declarationConstant(
    declaration: TsMorphNodeType,
    expression: TsMorphNodeType,
    resolution: ConstantBindingResolution
): ConstantValue | undefined {
    if (TsMorphNode.isVariableDeclaration(declaration)) {
        return variableDeclarationConstant(declaration, expression, resolution);
    }
    return TsMorphNode.isBindingElement(declaration)
        ? bindingElementConstant(declaration, expression, resolution)
        : undefined;
}

export function bindingsFromDeclaration(
    declaration: VariableDeclaration,
    value: ConstantValue,
    resolution: ConstantBindingResolution
): readonly BindingEntry[] {
    const nameNode = declaration.getNameNode();
    if (TsMorphNode.isIdentifier(nameNode)) {
        return [ [ nameNode.getText(), value ] ];
    }
    return collectVariableDeclarationBindings(declaration).flatMap(function (binding) {
        const result = declarationConstant(binding.declarationNode, binding.declarationNode, resolution);
        return result === undefined ? [] : [ [ binding.name, result ] ];
    });
}
