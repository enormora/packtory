import {
    Node as TypeScriptMorphNode,
    type CallExpression,
    type Expression,
    type Identifier,
    type Node as TypeScriptMorphNodeType,
    type Statement
} from 'ts-morph';
import type { EvaluatedValue } from './primitive-value.ts';
import type { AbstractValue, EvaluationReference } from './abstract-value.ts';

export const maximumEvaluationDepth = 32;

export type LocalScope = Pick<Map<TypeScriptMorphNodeType, EvaluationReference>, 'get' | 'set'> & {
    readonly fork: () => LocalScope;
};

export function createBindingReference(initial: AbstractValue, writable: boolean): EvaluationReference {
    let value = initial;
    return {
        get value() {
            return value;
        },
        assign(next) {
            if (!writable) {
                return undefined;
            }
            value = next;
            return value;
        }
    };
}

export function createLocalScope(initial: ReadonlyMap<TypeScriptMorphNodeType, EvaluationReference>): LocalScope {
    const cells = new Map(initial);
    return {
        get(key) {
            return cells.get(key);
        },
        set(key, cell) {
            cells.set(key, cell);
            return cells;
        },
        fork() {
            return createLocalScope(cells);
        }
    };
}
type NormalCompletion = { readonly type: 'normal'; };
type LoopControlCompletion = { readonly type: 'break' | 'continue'; };
type ReturnCompletion = { readonly type: 'return'; readonly value: AbstractValue; };
export type Completion = LoopControlCompletion | NormalCompletion | ReturnCompletion;
export const normalCompletion: Completion = { type: 'normal' };
export type EvaluationContext = {
    readonly locals: LocalScope;
    readonly consume: () => boolean;
    readonly depth: number;
    readonly readConstant: (identifier: Identifier) => EvaluatedValue | undefined;
    readonly evaluate: (expression: TypeScriptMorphNodeType, context: EvaluationContext) => AbstractValue | undefined;
    readonly execute: (statement: Statement, context: EvaluationContext) => Completion | undefined;
    readonly call: (call: CallExpression, context: EvaluationContext) => AbstractValue | undefined;
};

export function declarationOf(node: TypeScriptMorphNodeType): TypeScriptMorphNodeType | undefined {
    const parent = node.getParent();
    const symbol = TypeScriptMorphNode.isShorthandPropertyAssignment(parent)
        ? parent.getValueSymbol()
        : node.getSymbol();
    const declarations = symbol?.getDeclarations() ?? [];
    return declarations.length === 1 ? declarations[0] : undefined;
}

export function bindingReference(expression: Expression, context: EvaluationContext): EvaluationReference | undefined {
    return TypeScriptMorphNode.isIdentifier(expression)
        ? context.locals.get(declarationOf(expression) ?? expression)
        : undefined;
}
