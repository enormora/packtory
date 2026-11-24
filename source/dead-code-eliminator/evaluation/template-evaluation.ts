import { SyntaxKind, type TemplateExpression } from 'ts-morph';
import { evaluateAbstractBinary, type AbstractValue } from './abstract-value.ts';
import type { EvaluationContext } from './evaluation-context.ts';
import { evaluated } from './primitive-value.ts';

function appendText(text: AbstractValue | undefined, addition: AbstractValue | undefined): AbstractValue | undefined {
    return text === undefined || addition === undefined
        ? undefined
        : evaluateAbstractBinary(SyntaxKind.PlusToken, text, addition);
}

export function evaluateTemplate(template: TemplateExpression, context: EvaluationContext): AbstractValue | undefined {
    return template.getTemplateSpans().reduce<AbstractValue | undefined>(function (text, span) {
        const substituted = text === undefined
            ? undefined
            : appendText(text, context.evaluate(span.getExpression(), context));
        return appendText(substituted, evaluated(span.getLiteral().getLiteralText()));
    }, evaluated(template.getHead().getLiteralText()));
}
