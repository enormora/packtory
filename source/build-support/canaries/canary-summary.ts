import type { CanaryIssue } from './canary-comparison.ts';
import type { CanaryRunResult } from './canary-runner.ts';

const issueTitleLimit = 200;
const escapeCode = 0x1B;
const leftBracketCode = 0x5B;
const ansiFinalByteStart = 0x40;
const ansiFinalByteEnd = 0x7E;
const ansiSequencePrefixLength = 2;

function issueCount(issues: readonly CanaryIssue[], kind: CanaryIssue['kind']): number {
    return issues
        .filter(function (issue) {
            return issue.kind === kind;
        })
        .length;
}

function isAnsiFinalByte(code: number): boolean {
    return code >= ansiFinalByteStart && code <= ansiFinalByteEnd;
}

function ansiSequenceEndExclusive(value: string, startIndex: number): number {
    const finalOffset = Array.from(value.slice(startIndex + ansiSequencePrefixLength)).findIndex(function (character) {
        return isAnsiFinalByte(character.codePointAt(0) ?? 0);
    });
    return finalOffset === -1
        ? value.length
        : startIndex + ansiSequencePrefixLength + finalOffset + 1;
}

function stripAnsi(value: string): string {
    let result = '';
    let index = 0;
    while (index < value.length) {
        const code = value.codePointAt(index);
        const nextCode = value.codePointAt(index + 1);
        if (code === escapeCode && nextCode === leftBracketCode) {
            index = ansiSequenceEndExclusive(value, index);
        } else {
            result += value[index];
            index += 1;
        }
    }
    return result;
}

function normalizeCanaryPaths(value: string): string {
    return value.replaceAll('packtory-canary-', '<canary-clone>-');
}

function cleanMessage(value: string): string {
    return normalizeCanaryPaths(stripAnsi(value));
}

function nonEmptyLines(value: string): readonly string[] {
    return cleanMessage(value)
        .split('\n')
        .map(function (line) {
            return line.trimEnd();
        })
        .filter(function (line) {
            return line.length > 0;
        });
}

function shorten(value: string, limit: number): string {
    return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function issueTitle(issue: CanaryIssue, index: number): string {
    const firstLine = nonEmptyLines(issue.message)[0] ?? '(empty message)';
    return `${index + 1}. ${issue.kind}: ${shorten(firstLine, issueTitleLimit)}`;
}

function issueDetails(issue: CanaryIssue, index: number): readonly string[] {
    return [
        `<details${issue.kind === 'regression' ? ' open' : ''}>`,
        `<summary>${issueTitle(issue, index)}</summary>`,
        '',
        '~~~text',
        ...nonEmptyLines(issue.message),
        '~~~',
        '',
        '</details>'
    ];
}

export function formatCanarySummary(result: CanaryRunResult): string {
    const regressions = issueCount(result.issues, 'regression');
    const baselineRot = issueCount(result.issues, 'baseline-rot');
    const warnings = issueCount(result.issues, 'warning');
    const lines = [
        `## Packtory canary: ${result.name}`,
        '',
        `- Baseline ref: ${result.baselineResolvedRef}`,
        `- Source ref: ${result.candidateResolvedRef}`,
        `- Regressions: ${regressions}`,
        `- Baseline rot: ${baselineRot}`,
        `- Warnings: ${warnings}`,
        '',
        '### Issues',
        '',
        ...result.issues.length === 0
            ? [ 'No canary issues found.' ]
            : result.issues.flatMap(issueDetails)
    ];
    return `${lines.join('\n')}\n`;
}

export function warningAnnotationMessages(result: CanaryRunResult): readonly string[] {
    return result.issues.map(function (issue, index) {
        return `${result.name}: ${issueTitle(issue, index)}`;
    });
}
