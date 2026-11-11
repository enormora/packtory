import {
    Node as TypeScriptMorphNode,
    type Expression,
    type Identifier,
    type ObjectLiteralExpression,
    type VariableDeclaration
} from 'ts-morph';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { constantDominatesRead, constantStatement } from './constant-binding.ts';
import { declarationOf } from './evaluation-context.ts';

export type ObjectOrigin = {
    readonly object: ObjectLiteralExpression;
    readonly creationIsAtRead: boolean;
};

function availableObjectDeclaration(read: Identifier): VariableDeclaration | undefined {
    const declaration = declarationOf(read);
    if (!TypeScriptMorphNode.isVariableDeclaration(declaration)) {
        return undefined;
    }
    const statement = constantStatement(declaration);
    if (statement === undefined || statement.isExported()) {
        return undefined;
    }
    return constantDominatesRead(declaration, read) ? declaration : undefined;
}

function aliasedObjectOrigin(read: Identifier): ObjectOrigin | undefined {
    const declaration = availableObjectDeclaration(read);
    if (declaration === undefined) {
        return undefined;
    }
    const object = unwrapExpression(declaration.getInitializer());
    if (!TypeScriptMorphNode.isObjectLiteralExpression(object)) {
        return undefined;
    }
    return bindingHasOnlyUses(declaration.getNameNode(), declaration, new Set([ read ]))
        ? { object, creationIsAtRead: false }
        : undefined;
}

export function unescapedObjectOrigin(expression: Expression | undefined): ObjectOrigin | undefined {
    const node = unwrapExpression(expression);
    if (TypeScriptMorphNode.isObjectLiteralExpression(node)) {
        return { object: node, creationIsAtRead: true };
    }
    return TypeScriptMorphNode.isIdentifier(node) ? aliasedObjectOrigin(node) : undefined;
}
