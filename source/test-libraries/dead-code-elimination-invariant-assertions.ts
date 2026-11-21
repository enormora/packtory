import assert from 'node:assert';
import { collectDeadCodeEliminationOutputIssues } from '../dead-code-eliminator/invariants/output-invariants.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import { createProject } from './typescript-project.ts';

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
    for (const bundle of bundles) {
        for (const resource of bundle.contents) {
            for (const effect of resource.analysis.sideEffectStatements) {
                assert.match(
                    effect.kind,
                    /\S/u,
                    `${bundle.name}/${resource.fileDescription.targetFilePath}: empty side-effect description`
                );
                assert.ok(
                    Number.isSafeInteger(effect.line) && effect.line > 0,
                    `${bundle.name}/${resource.fileDescription.targetFilePath}: invalid side-effect line`
                );
            }
        }
    }
    const issues = collectDeadCodeEliminationOutputIssues(bundles, createProject);
    if (issues.length > 0) {
        assert.fail(formatIssues(caseName, issues));
    }
}
