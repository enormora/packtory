import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type ArrowFunction,
    type Block,
    type Statement,
    type Expression,
    type FunctionDeclaration,
    type FunctionExpression,
    type GetAccessorDeclaration,
    type MethodDeclaration,
    type ObjectLiteralExpression,
    type PropertyAssignment,
    type ShorthandPropertyAssignment,
    type SetAccessorDeclaration
} from 'ts-morph';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { pureLeafKinds } from '../syntax-kind-sets.ts';
import { numericLiteralValue } from '../evaluation/primitive-value.ts';

export type BuilderFunction = ArrowFunction | FunctionDeclaration | FunctionExpression | MethodDeclaration;
type ObjectMethod = GetAccessorDeclaration | MethodDeclaration | SetAccessorDeclaration;
export type ObjectMember = ObjectMethod | PropertyAssignment | ShorthandPropertyAssignment;
type ReturnValuePurityChecker = (expression: Expression) => boolean;

function firstBodyStatement(body: Block): Statement | undefined {
    return body.getStatements().find(function (statement) {
        return !TypeScriptMorphNode.isEmptyStatement(statement) &&
            !(TypeScriptMorphNode.isExpressionStatement(statement) &&
                TypeScriptMorphNode.isStringLiteral(statement.getExpression()));
    });
}

export function builderReturnExpression(builder: BuilderFunction): Expression | undefined {
    const body = builder.getBody();
    if (TypeScriptMorphNode.isExpression(body)) {
        return body;
    }
    const block = body?.asKind(SyntaxKind.Block);
    const first = block === undefined ? undefined : firstBodyStatement(block);
    return TypeScriptMorphNode.isReturnStatement(first) ? first.getExpression() : undefined;
}

export function objectMember(property: TypeScriptMorphNode): ObjectMember | undefined {
    return property.asKind(SyntaxKind.PropertyAssignment) ?? property.asKind(SyntaxKind.MethodDeclaration) ??
        property.asKind(SyntaxKind.GetAccessor) ?? property.asKind(SyntaxKind.SetAccessor);
}

export function staticPropertyName(name: TypeScriptMorphNode): string | undefined {
    if (TypeScriptMorphNode.isBindingElement(name)) {
        return staticPropertyName(name.getPropertyNameNode() ?? name.getNameNode());
    }
    if (TypeScriptMorphNode.isIdentifier(name)) {
        return name.compilerNode.text;
    }
    if (TypeScriptMorphNode.isNumericLiteral(name)) {
        return String(numericLiteralValue(name));
    }
    return TypeScriptMorphNode.isStringLiteral(name)
        ? name.getLiteralValue()
        : undefined;
}

export function objectMemberName(member: ObjectMember): string {
    return staticPropertyName(member.getNameNode()) ?? member.getName();
}

function isStaticDataMember(
    property: TypeScriptMorphNode
): property is MethodDeclaration | PropertyAssignment | ShorthandPropertyAssignment {
    if (TypeScriptMorphNode.isShorthandPropertyAssignment(property)) {
        return true;
    }
    return (TypeScriptMorphNode.isPropertyAssignment(property) || TypeScriptMorphNode.isMethodDeclaration(property)) &&
        !TypeScriptMorphNode.isComputedPropertyName(property.getNameNode());
}

export function objectDataShapeIsKnown(object: ObjectLiteralExpression): boolean {
    const names = new Set<string>();
    return object.getProperties().every(function (property) {
        if (!isStaticDataMember(property)) {
            return false;
        }
        const name = objectMemberName(property);
        if (names.has(name)) {
            return false;
        }
        names.add(name);
        return true;
    });
}

function objectMemberCreationIsPure(property: TypeScriptMorphNode, recurse: ReturnValuePurityChecker): boolean {
    if (TypeScriptMorphNode.isShorthandPropertyAssignment(property)) {
        return recurse(property.getNameNode());
    }
    const member = objectMember(property);
    if (member === undefined || TypeScriptMorphNode.isComputedPropertyName(member.getNameNode())) {
        return false;
    }
    return !TypeScriptMorphNode.isPropertyAssignment(member) || recurse(member.getInitializerOrThrow());
}

function structureCreationIsPure(expression: Expression, recurse: ReturnValuePurityChecker): boolean {
    if (TypeScriptMorphNode.isObjectLiteralExpression(expression)) {
        return expression.getProperties().every(function (property) {
            return objectMemberCreationIsPure(property, recurse);
        });
    }
    if (TypeScriptMorphNode.isArrayLiteralExpression(expression)) {
        return expression.getElements().every(function (element) {
            return TypeScriptMorphNode.isOmittedExpression(element) || recurse(element);
        });
    }
    return false;
}

function readsParameter(expression: Expression, parameters: ReadonlySet<TypeScriptMorphNode>): boolean {
    if (!TypeScriptMorphNode.isIdentifier(expression)) {
        return false;
    }
    const parent = expression.getParent();
    const symbol = TypeScriptMorphNode.isShorthandPropertyAssignment(parent)
        ? parent.getValueSymbol()
        : expression.getSymbol();
    return symbol?.getDeclarations().some(function (declaration) {
        return parameters.has(declaration);
    }) === true;
}

export function returnCreationIsPure(expression: Expression, parameters: ReadonlySet<TypeScriptMorphNode>): boolean {
    const unwrapped = unwrapExpression(expression);
    return pureLeafKinds.has(unwrapped.getKind()) || readsParameter(unwrapped, parameters) ||
        structureCreationIsPure(unwrapped, function (candidate) {
            return returnCreationIsPure(candidate, parameters);
        });
}

function builderParametersArePure(builder: BuilderFunction): boolean {
    return builder.getParameters().every(function (parameter) {
        return TypeScriptMorphNode.isIdentifier(parameter.getNameNode()) && parameter.getInitializer() === undefined;
    });
}

export function builderIsSynchronous(builder: BuilderFunction): boolean {
    return !builder.isAsync() && (TypeScriptMorphNode.isArrowFunction(builder) || !builder.isGenerator());
}

function builderVoidReturnIsPure(builder: BuilderFunction): boolean {
    const body = builder.getBody()?.asKind(SyntaxKind.Block);
    if (body === undefined) {
        return false;
    }
    const first = firstBodyStatement(body);
    return first === undefined || TypeScriptMorphNode.isReturnStatement(first);
}

export function builderBodyIsPure(builder: BuilderFunction): boolean {
    if (!builderIsSynchronous(builder) || !builderParametersArePure(builder)) {
        return false;
    }
    const returned = builderReturnExpression(builder);
    return returned === undefined
        ? builderVoidReturnIsPure(builder)
        : returnCreationIsPure(returned, new Set(builder.getParameters()));
}

export function builderCallIsPure(builder: BuilderFunction): boolean {
    return builder.getFullText().includes('@__NO_SIDE_EFFECTS__') || builderBodyIsPure(builder);
}
