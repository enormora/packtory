import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    ts,
    type ArrowFunction,
    type CallExpression,
    type Expression,
    type FunctionDeclaration,
    type FunctionExpression,
    type SourceFile,
    type ParameterDeclaration,
    type Statement
} from 'ts-morph';
import { takeWhile } from 'remeda';
import { unwrapExpression } from '../expression-unwrapping.ts';
import { hasDynamicScope } from '../dynamic-scope.ts';
import { bindingValueIsStable } from '../binding-stability.ts';
import { declarationOf } from './evaluation-context.ts';

export type LocalFunction = ArrowFunction | FunctionDeclaration | FunctionExpression;
export type CallTargetResolver = (call: CallExpression) => LocalFunction | undefined;
type LocalFunctionPredicate = (target: LocalFunction) => boolean;

export function runtimeParameters(target: LocalFunction): readonly ParameterDeclaration[] {
    return target.getParameters().filter(function hasRuntimeArgument(parameter) {
        return parameter.getName() !== 'this';
    });
}

export function parameterBindingIsStable(parameter: ParameterDeclaration): boolean {
    return parameter.getParent().getDescendantsOfKind(SyntaxKind.FunctionDeclaration).every(function (declaration) {
        return declaration.getName() !== parameter.getName();
    });
}

function directiveText(statement: Statement): string | undefined {
    if (!TypeScriptMorphNode.isExpressionStatement(statement)) {
        return undefined;
    }
    const expression = statement.getExpression();
    return TypeScriptMorphNode.isStringLiteral(expression) ? expression.getText() : undefined;
}

function sourceIsStrict(source: SourceFile): boolean {
    if (ts.isExternalModule(source.compilerNode)) {
        return true;
    }
    const directives = takeWhile(source.getStatements(), function (statement) {
        return directiveText(statement) !== undefined;
    });
    return directives.some(function (statement) {
        const text = directiveText(statement);
        return text === '"use strict"' || text === "'use strict'";
    });
}

function declarationHasConditionalReplacement(declaration: FunctionDeclaration): boolean {
    const source = declaration.getSourceFile();
    const replaced = source.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).some(function (candidate) {
        return candidate !== declaration && candidate.getName() === declaration.getName() &&
            !TypeScriptMorphNode.isSourceFile(candidate.getParent());
    });
    return replaced && !sourceIsStrict(source);
}

function declarationBindingIsStable(declaration: FunctionDeclaration): boolean {
    const name = declaration.getNameNodeOrThrow();
    if (declarationHasConditionalReplacement(declaration)) {
        return false;
    }
    return bindingValueIsStable(name);
}

function declaredFunction(target: Expression): FunctionDeclaration | undefined {
    if (!TypeScriptMorphNode.isIdentifier(target)) {
        return undefined;
    }
    const declaration = declarationOf(target);
    if (!TypeScriptMorphNode.isFunctionDeclaration(declaration)) {
        return undefined;
    }
    return target.getAncestors().includes(declaration.getParent()) ? declaration : undefined;
}

function functionForCall(call: CallExpression): LocalFunction | undefined {
    const target = unwrapExpression(call.getExpression());
    return TypeScriptMorphNode.isArrowFunction(target) || TypeScriptMorphNode.isFunctionExpression(target)
        ? target
        : declaredFunction(target);
}

function targetBindingIsStable(target: LocalFunction): boolean {
    return !TypeScriptMorphNode.isFunctionDeclaration(target) || declarationBindingIsStable(target);
}

function targetIsSupported(
    target: LocalFunction,
    accepts: LocalFunctionPredicate,
    proofs: WeakMap<LocalFunction, boolean>
): boolean {
    if (!proofs.has(target)) {
        proofs.set(target, accepts(target) && targetBindingIsStable(target));
    }
    return proofs.get(target) === true;
}

export function createCallTargetResolver(sourceFile: SourceFile, accepts: LocalFunctionPredicate): CallTargetResolver {
    const proofs = new WeakMap<LocalFunction, boolean>();
    let sourceIsSafe: boolean | null = null;
    return function (call) {
        const target = functionForCall(call);
        if (target === undefined) {
            return undefined;
        }
        sourceIsSafe = sourceIsSafe ?? !hasDynamicScope(sourceFile);
        return sourceIsSafe && targetIsSupported(target, accepts, proofs) ? target : undefined;
    };
}
