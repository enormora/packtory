import type { PackageApiInspection, PublicExportApi, TypeExportNames } from './package-api-inspection.ts';

export type CanaryIssue = {
    readonly kind: 'baseline-rot' | 'regression' | 'warning';
    readonly message: string;
};

export type CanaryComparison = {
    readonly issues: readonly CanaryIssue[];
};

type PackageLookup = ReadonlyMap<string, PackageApiInspection['packages'][number]>;
type ExportLookup = ReadonlyMap<string, PublicExportApi>;

function packageLookup(inspection: PackageApiInspection): PackageLookup {
    return new Map(inspection.packages.map(function (entry) {
        return [ entry.name, entry ];
    }));
}

function exportLookup(exports: readonly PublicExportApi[]): ExportLookup {
    return new Map(exports.map(function (entry) {
        return [ entry.specifier, entry ];
    }));
}

function missingValues(
    baseline: readonly string[],
    candidate: readonly string[]
): readonly string[] {
    const candidateValues = new Set(candidate);
    return baseline.filter(function (value) {
        return !candidateValues.has(value);
    });
}

function typeNamesByKind(names: TypeExportNames, kind: keyof TypeExportNames): readonly string[] {
    return names[kind];
}

function messageFromParts(parts: readonly string[]): string {
    return parts.join(' ');
}

function issueSection(label: string, content: string): readonly string[] {
    return content.length === 0
        ? []
        : [ '', `${label}:`, content ];
}

function runtimeFailureMessage(
    packageName: string,
    specifier: string,
    baselineError: string,
    candidateError: string
): string {
    return [
        `Package "${packageName}" export "${specifier}" fails runtime import checks.`,
        ...issueSection('npm baseline error', baselineError),
        ...issueSection('source error', candidateError)
    ]
        .join('\n');
}

function compareTypeNames(
    packageName: string,
    specifier: string,
    baseline: TypeExportNames,
    candidate: TypeExportNames
): readonly CanaryIssue[] {
    return ([ 'namespace', 'type', 'value' ] as const).flatMap(function (kind): readonly CanaryIssue[] {
        return missingValues(typeNamesByKind(baseline, kind), typeNamesByKind(candidate, kind)).map(function (name) {
            return {
                kind: 'regression',
                message: `Package "${packageName}" export "${specifier}" is missing ${kind} export "${name}"`
            };
        });
    });
}

function compareBinTargets(
    baselinePackage: PackageApiInspection['packages'][number],
    candidatePackage: PackageApiInspection['packages'][number]
): readonly CanaryIssue[] {
    return missingValues(baselinePackage.binTargets, candidatePackage.binTargets).map(function (target) {
        return {
            kind: 'regression',
            message: `Package "${baselinePackage.name}" is missing bin target "${target}"`
        };
    });
}

function compareExport(
    packageName: string,
    baseline: PublicExportApi,
    candidate: PublicExportApi
): readonly CanaryIssue[] {
    const issues: CanaryIssue[] = [];
    if (baseline.runtimeImportError.length > 0) {
        issues.push({
            kind: 'baseline-rot',
            message: runtimeFailureMessage(
                packageName,
                baseline.specifier,
                baseline.runtimeImportError,
                candidate.runtimeImportError
            )
        });
    } else if (candidate.runtimeImportError.length > 0) {
        issues.push({
            kind: 'regression',
            message: runtimeFailureMessage(packageName, baseline.specifier, '', candidate.runtimeImportError)
        });
    }
    const exportIssues = missingValues(
        baseline.runtimeImportError.length === 0 && candidate.runtimeImportError.length === 0
            ? baseline.runtimeExportNames
            : [],
        candidate.runtimeExportNames
    )
        .map(function (name) {
            return {
                kind: 'regression' as const,
                message: `Package "${packageName}" export "${baseline.specifier}" is missing runtime export "${name}"`
            };
        });
    return [
        ...issues,
        ...exportIssues,
        ...compareTypeNames(packageName, baseline.specifier, baseline.typeExportNames, candidate.typeExportNames)
    ];
}

function diagnosticIssues(
    packageName: string,
    baselineDiagnostics: readonly string[],
    candidateDiagnostics: readonly string[]
): readonly CanaryIssue[] {
    const baselineSet = new Set(baselineDiagnostics);
    return candidateDiagnostics
        .filter(function (diagnostic) {
            return !baselineSet.has(diagnostic);
        })
        .map(function (diagnostic) {
            return {
                kind: 'regression',
                message: `Package "${packageName}" has a new TypeScript diagnostic: ${diagnostic}`
            };
        });
}

function baselineDiagnosticIssues(packageName: string, diagnostics: readonly string[]): readonly CanaryIssue[] {
    return diagnostics.map(function (diagnostic) {
        return {
            kind: 'baseline-rot',
            message: `Package "${packageName}" has an npm baseline TypeScript diagnostic: ${diagnostic}`
        };
    });
}

function comparePackage(
    baselinePackage: PackageApiInspection['packages'][number],
    candidatePackage: PackageApiInspection['packages'][number] | undefined
): readonly CanaryIssue[] {
    if (candidatePackage === undefined) {
        return [
            {
                kind: 'regression',
                message: `Package "${baselinePackage.name}" exists in the npm baseline but is missing from source`
            }
        ];
    }
    const candidateExports = exportLookup(candidatePackage.publicExports);
    const issues: CanaryIssue[] = [
        ...compareBinTargets(baselinePackage, candidatePackage),
        ...baselineDiagnosticIssues(baselinePackage.name, baselinePackage.typeDiagnostics),
        ...diagnosticIssues(
            baselinePackage.name,
            baselinePackage.typeDiagnostics,
            candidatePackage.typeDiagnostics
        )
    ];
    for (const baselineExport of baselinePackage.publicExports) {
        const candidateExport = candidateExports.get(baselineExport.specifier);
        if (candidateExport === undefined) {
            issues.push({
                kind: 'regression',
                message: messageFromParts([
                    `Package "${baselinePackage.name}" export "${baselineExport.specifier}" exists in the npm baseline`,
                    'but is missing from source'
                ])
            });
        } else {
            issues.push(...compareExport(baselinePackage.name, baselineExport, candidateExport));
        }
    }
    return issues;
}

export function compareCanaryApis(
    baseline: PackageApiInspection,
    candidate: PackageApiInspection
): CanaryComparison {
    const candidatePackages = packageLookup(candidate);
    return {
        issues: baseline.packages.flatMap(function (baselinePackage) {
            return comparePackage(baselinePackage, candidatePackages.get(baselinePackage.name));
        })
    };
}
