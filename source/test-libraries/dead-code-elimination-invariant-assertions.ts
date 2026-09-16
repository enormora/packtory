import assert from 'node:assert';
import { collectDeadCodeEliminationOutputIssues } from '../dead-code-eliminator/invariants/output-invariants.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';

function formatIssues(caseName: string, issues: readonly string[]): string {
    return `${caseName}: dead code elimination output invariant failures:\n${
        issues
            .map(function (issue) {
                return `- ${issue}`;
            })
            .join('\n')
    }`;
}

export function assertValidDeadCodeEliminationOutput(caseName: string, bundles: readonly AnalyzedBundle[]): void {
    const issues = collectDeadCodeEliminationOutputIssues(bundles);
    if (issues.length > 0) {
        assert.fail(formatIssues(caseName, issues));
    }
}
