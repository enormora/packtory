import { isTruthy } from 'remeda';
import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    VariableDeclarationKind,
    type DoStatement,
    type Expression,
    type ForStatement,
    type Statement,
    type VariableDeclaration,
    type VariableDeclarationList,
    type WhileStatement
} from 'ts-morph';
import {
    normalCompletion,
    createBindingReference,
    type Completion,
    type EvaluationContext
} from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';
import { resourceBindingIsHarmless } from './resource-binding.ts';
import { evaluateSwitch } from './switch-evaluation.ts';

type LoopStatement = DoStatement | ForStatement | WhileStatement;

function declareLocal(
    declaration: VariableDeclaration,
    kind: VariableDeclarationKind,
    context: EvaluationContext
): boolean {
    if (!TypeScriptMorphNode.isIdentifier(declaration.getNameNode())) {
        return false;
    }
    const initializer = declaration.getInitializer();
    const value = initializer === undefined ? evaluated(undefined) : context.evaluate(initializer, context);
    if (value === undefined) {
        return false;
    }
    if (kind === VariableDeclarationKind.Using && !resourceBindingIsHarmless(kind, value)) {
        return false;
    }
    context.locals.set(declaration, createBindingReference(value, kind === VariableDeclarationKind.Let));
    return true;
}

function declareLocals(list: VariableDeclarationList, context: EvaluationContext): boolean {
    const kind = list.getDeclarationKind();
    const kinds = [ VariableDeclarationKind.Const, VariableDeclarationKind.Let, VariableDeclarationKind.Using ];
    return kinds.includes(kind) &&
        list.getDeclarations().every(function (declaration) {
            return declareLocal(declaration, kind, context);
        });
}

function executeBlock(statement: Statement, context: EvaluationContext): Completion | undefined {
    const block = statement.asKindOrThrow(SyntaxKind.Block);
    const local = { ...context, locals: context.locals.fork() };
    for (const child of block.getStatements()) {
        const completion = context.execute(child, local);
        if (completion?.type !== 'normal') {
            return completion;
        }
    }
    return normalCompletion;
}

function completeIteration(completion: Completion | undefined): Completion | undefined {
    return completion?.type === 'continue' ? normalCompletion : completion;
}

function completeLoop(completion: Completion | undefined): Completion | undefined {
    return completion?.type === 'break' ? normalCompletion : completion;
}

function executeIteration(statement: LoopStatement, context: EvaluationContext): Completion | undefined {
    const completion = completeIteration(context.execute(statement.getStatement(), context));
    if (completion?.type !== 'normal') {
        return completion;
    }
    const incrementor = TypeScriptMorphNode.isForStatement(statement) ? statement.getIncrementor() : undefined;
    return incrementor !== undefined && context.evaluate(incrementor, context) === undefined
        ? undefined
        : normalCompletion;
}

function loopContinues(condition: Expression | undefined, context: EvaluationContext): boolean | undefined {
    if (condition === undefined) {
        return true;
    }
    const value = context.evaluate(condition, context);
    return value === undefined ? undefined : isTruthy(value.value);
}

function iterateLoop(
    statement: LoopStatement,
    condition: Expression | undefined,
    context: EvaluationContext
): Completion | undefined {
    while (context.consume()) {
        const continues = loopContinues(condition, context);
        if (continues !== true) {
            return continues === false ? normalCompletion : undefined;
        }
        const completion = executeIteration(statement, context);
        if (completion?.type !== 'normal') {
            return completeLoop(completion);
        }
    }
    return undefined;
}

function initializeLoop(statement: LoopStatement, context: EvaluationContext): boolean {
    if (!TypeScriptMorphNode.isForStatement(statement)) {
        return true;
    }
    const initializer = statement.getInitializer();
    if (initializer === undefined) {
        return true;
    }
    return TypeScriptMorphNode.isVariableDeclarationList(initializer)
        ? declareLocals(initializer, context)
        : context.evaluate(initializer, context) !== undefined;
}

function loopStatement(statement: Statement): LoopStatement {
    return statement.asKind(SyntaxKind.ForStatement) ?? statement.asKind(SyntaxKind.WhileStatement) ??
        statement.asKindOrThrow(SyntaxKind.DoStatement);
}

function executeLoop(statement: Statement, context: EvaluationContext): Completion | undefined {
    const loop = loopStatement(statement);
    const local = { ...context, locals: context.locals.fork() };
    if (!initializeLoop(loop, local)) {
        return undefined;
    }
    const condition = TypeScriptMorphNode.isForStatement(loop) ? loop.getCondition() : loop.getExpression();
    if (TypeScriptMorphNode.isDoStatement(loop)) {
        const completion = executeIteration(loop, local);
        if (completion?.type !== 'normal') {
            return completeLoop(completion);
        }
    }
    return iterateLoop(loop, condition, local);
}

function executeBreak(statement: Statement): Completion | undefined {
    return statement.asKindOrThrow(SyntaxKind.BreakStatement).getLabel() === undefined ? { type: 'break' } : undefined;
}

function executeContinue(statement: Statement): Completion | undefined {
    return statement.asKindOrThrow(SyntaxKind.ContinueStatement).getLabel() === undefined
        ? { type: 'continue' }
        : undefined;
}

function executeReturn(statement: Statement, context: EvaluationContext): Completion | undefined {
    const expression = statement.asKindOrThrow(SyntaxKind.ReturnStatement).getExpression();
    const value = expression === undefined ? evaluated(undefined) : context.evaluate(expression, context);
    return value === undefined ? undefined : { type: 'return', value };
}

function executeIf(statement: Statement, context: EvaluationContext): Completion | undefined {
    const branch = statement.asKindOrThrow(SyntaxKind.IfStatement);
    const condition = context.evaluate(branch.getExpression(), context);
    if (condition === undefined) {
        return undefined;
    }
    const selected = isTruthy(condition.value) ? branch.getThenStatement() : branch.getElseStatement();
    return selected === undefined ? normalCompletion : context.execute(selected, context);
}

function executeVariable(statement: Statement, context: EvaluationContext): Completion | undefined {
    return declareLocals(statement.asKindOrThrow(SyntaxKind.VariableStatement).getDeclarationList(), context)
        ? normalCompletion
        : undefined;
}

function executeExpression(statement: Statement, context: EvaluationContext): Completion | undefined {
    const expression = statement.asKindOrThrow(SyntaxKind.ExpressionStatement).getExpression();
    return context.evaluate(expression, context) === undefined ? undefined : normalCompletion;
}

type StatementEvaluator = (statement: Statement, context: EvaluationContext) => Completion | undefined;
export function evaluateStatement(statement: Statement, context: EvaluationContext): Completion | undefined {
    const evaluators: Partial<Record<SyntaxKind, StatementEvaluator>> = {
        [SyntaxKind.Block]: executeBlock,
        [SyntaxKind.ReturnStatement]: executeReturn,
        [SyntaxKind.IfStatement]: executeIf,
        [SyntaxKind.SwitchStatement]: evaluateSwitch,
        [SyntaxKind.ForStatement]: executeLoop,
        [SyntaxKind.WhileStatement]: executeLoop,
        [SyntaxKind.DoStatement]: executeLoop,
        [SyntaxKind.BreakStatement]: executeBreak,
        [SyntaxKind.ContinueStatement]: executeContinue,
        [SyntaxKind.VariableStatement]: executeVariable,
        [SyntaxKind.ExpressionStatement]: executeExpression
    };
    return context.consume() ? evaluators[statement.getKind()]?.(statement, context) : undefined;
}
