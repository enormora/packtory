import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type BindingElement,
    type Expression,
    type ObjectBindingPattern,
    type VariableDeclaration,
    type VariableStatement
} from 'ts-morph';
import type { SourcePreparation } from '../../source-transformation/source-preparation.ts';
import type { SourceTextEdit } from '../../source-transformation/text-edits.ts';
import { bindingHasOnlyUses } from '../binding-stability.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { createSourceEvaluation, type PrimitiveEvaluator } from '../evaluation/constant-evaluation.ts';
import { unescapedObjectOrigin, type ObjectOrigin } from '../evaluation/object-origin.ts';
import {
    objectReadShape,
    propertyIsDefined,
    type ObjectReadShape,
    type ObjectPropertyRead
} from '../evaluation/object-read-shape.ts';
import { returnCreationIsPure, staticPropertyName } from '../liveness/builder-return.ts';
import { sourceReplacement, type SourcePart } from './source-replacement.ts';

type ObjectBinding = { readonly pattern: ObjectBindingPattern; readonly initializer: Expression; };

function defaultCanDisappear(
    element: BindingElement,
    field: ObjectPropertyRead,
    evaluate: PrimitiveEvaluator
): boolean {
    const fallback = element.getInitializer();
    return fallback === undefined || propertyIsDefined(field.value) || evaluate(fallback) !== undefined ||
        returnCreationIsPure(fallback, new Set());
}

function elementCanDisappear(element: BindingElement, shape: ObjectReadShape, evaluate: PrimitiveEvaluator): boolean {
    const name = element.getNameNode();
    const key = staticPropertyName(element);
    if (
        key === undefined || element.getDotDotDotToken() !== undefined || !bindingHasOnlyUses(name, element, new Set())
    ) {
        return false;
    }
    const field = shape.propertyRead(key);
    return field?.getIsPure === true && defaultCanDisappear(element, field, evaluate);
}

function objectBindingDeclaration(statement: VariableStatement): VariableDeclaration | undefined {
    if (
        statement.isExported() || statement.isAmbient() ||
        ![ VariableDeclarationKind.Const, VariableDeclarationKind.Let, VariableDeclarationKind.Var ].includes(
            statement.getDeclarationKind()
        )
    ) {
        return undefined;
    }
    const declarations = statement.getDeclarations();
    return declarations.length === 1 ? declarations[0] : undefined;
}

function statementPattern(statement: VariableStatement): ObjectBinding | undefined {
    const declaration = objectBindingDeclaration(statement);
    const pattern = declaration?.getNameNode();
    const initializer = declaration?.getInitializer();
    return initializer !== undefined && TypeScriptMorphNode.isObjectBindingPattern(pattern)
        ? { pattern, initializer }
        : undefined;
}

function creationSource(origin: ObjectOrigin, shape: ObjectReadShape): readonly SourcePart[] {
    return !origin.creationIsAtRead || shape.creationIsPure ? [ ';' ] : [ '(', origin.object, ');' ];
}

function statementReplacement(
    statement: VariableStatement,
    evaluate: PrimitiveEvaluator
): readonly SourcePart[] | undefined {
    const binding = statementPattern(statement);
    if (binding === undefined) {
        return undefined;
    }
    const origin = unescapedObjectOrigin(binding.initializer);
    if (origin === undefined) {
        return undefined;
    }
    const shape = objectReadShape(origin.object, evaluate);
    if (
        shape === undefined || binding.pattern.getElements().some(function (element) {
            return !elementCanDisappear(element, shape, evaluate);
        })
    ) {
        return undefined;
    }
    return creationSource(origin, shape);
}

export function reduceObjectBindings(preparation: SourcePreparation): void {
    const { sourceFile } = preparation;
    if (hasDynamicScope(sourceFile)) {
        return;
    }
    const evaluate = createSourceEvaluation(sourceFile).primitiveValue;
    let previousEnd = 0;
    const edits = sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement).flatMap(
        function (statement): readonly SourceTextEdit[] {
            if (statement.getStart() < previousEnd) {
                return [];
            }
            const replacement = statementReplacement(statement, evaluate);
            if (replacement === undefined) {
                return [];
            }
            previousEnd = statement.getEnd();
            return sourceReplacement(statement, replacement);
        }
    );
    preparation.applyEdits(edits);
}
