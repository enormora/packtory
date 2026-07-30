import type { ProblemKind, ResolutionKind } from '@arethetypeswrong/core';
import type { PackageResolutionReport, ResolutionProblemReport } from './type-script-package-resolution.ts';

type ProblemGroup = {
    readonly shortDescription: string;
    readonly problems: readonly ResolutionProblemReport[];
};

function activeProblems(problems: readonly ResolutionProblemReport[]): readonly ResolutionProblemReport[] {
    return problems.filter(function (problem) {
        return problem.affectedResolutionKinds.length > 0;
    });
}

function groupProblemsByKind(problems: readonly ResolutionProblemReport[]): ReadonlyMap<ProblemKind, ProblemGroup> {
    const groups = new Map<ProblemKind, ProblemGroup>();

    for (const problem of problems) {
        const existing = groups.get(problem.kind);
        groups.set(problem.kind, {
            shortDescription: problem.shortDescription,
            problems: existing === undefined ? [ problem ] : [ ...existing.problems, problem ]
        });
    }

    return groups;
}

function formatQuotedList(prefix: string, values: readonly string[]): string {
    return values
        .map(function (value, index) {
            const separator = index === 0 ? ` ${prefix} ` : ', ';
            return `${separator}"${value}"`;
        })
        .join('');
}

function affectedEntrypointsOf(group: ProblemGroup, entrypoints: readonly string[]): readonly string[] {
    return entrypoints.filter(function (entrypoint) {
        return group.problems.some(function (problem) {
            return problem.affectedEntrypoints.includes(entrypoint);
        });
    });
}

function affectedResolutionKindsOf(
    group: ProblemGroup,
    resolutionKinds: readonly ResolutionKind[]
): readonly ResolutionKind[] {
    return resolutionKinds.filter(function (resolutionKind) {
        return group.problems.some(function (problem) {
            return problem.affectedResolutionKinds.includes(resolutionKind);
        });
    });
}

function formatProblemGroup(
    packageName: string,
    group: ProblemGroup,
    entrypoints: readonly string[],
    resolutionKinds: readonly ResolutionKind[]
): string {
    const findings = group.problems.length === 1 ? '' : ` (${group.problems.length} findings)`;
    const entrypointList = formatQuotedList('affecting entrypoints', affectedEntrypointsOf(group, entrypoints));
    const resolutionList = formatQuotedList('in resolutions', affectedResolutionKindsOf(group, resolutionKinds));
    return (
        `Package "${packageName}" failed TypeScript integrity: ` +
        `${group.shortDescription}${findings}${entrypointList}${resolutionList}`
    );
}

export function summarizeResolutionReport(
    packageName: string,
    report: PackageResolutionReport,
    resolutionKinds: readonly ResolutionKind[]
): readonly string[] {
    if (report.kind === 'missing-declarations') {
        return [ `Package "${packageName}" does not expose TypeScript declarations` ];
    }

    return Array.from(
        groupProblemsByKind(activeProblems(report.problems)).values(),
        function (group) {
            return formatProblemGroup(packageName, group, report.entrypoints, resolutionKinds);
        }
    );
}
