import { type Schema, parseEither } from '@effect/schema/Schema';
import { Result } from 'true-myth';
import { isRight } from 'effect/Either';
import { formatAllParseIssues } from './formatting.js';

type ValidationFailure = {
    readonly issues: readonly string[];
    readonly summary: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- https://github.com/microsoft/TypeScript/issues/1213
export function validateAgainstSchema<TSchema extends Schema<any>>(
    schema: TSchema,
    data: unknown
): Readonly<Result<Schema.To<TSchema>, ValidationFailure>> {
    const result = parseEither(schema)(data, { errors: 'all', onExcessProperty: 'error' });

    if (isRight(result)) {
        return Result.ok(result.right);
    }

    const issues = formatAllParseIssues(result.left);

    return Result.err({
        issues,
        summary: `Validation failed with ${issues.length} issue(s):\n* ${issues.join('\n* ')}`
    });
}
