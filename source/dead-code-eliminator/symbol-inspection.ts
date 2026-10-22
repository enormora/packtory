import { match } from 'ts-pattern';
import { doNothing } from 'remeda';
import type { AnalyzedBundle, BundleSymbolInspection, InspectedSymbol } from './analyzed-bundle.ts';
import type { LoadedBundle } from './load-bundle.ts';
import { bindingIdentifier } from './reachability/binding-identifier.ts';
import type { DeadCodeEliminationTrace } from './trace.ts';

type TraceEvent = Parameters<NonNullable<DeadCodeEliminationTrace>['collector']['record']>[0];
type RetentionStep = InspectedSymbol['chain'][number];

export type SymbolLocation = {
    readonly identifier: string;
    readonly targetFilePath: string;
    readonly name: string;
    readonly line: number;
    readonly kind: string;
};

export function locateSymbols(loaded: LoadedBundle): readonly SymbolLocation[] {
    return loaded.fileBindings.flatMap(function (file) {
        return file.bindings.map(function (binding) {
            return {
                identifier: bindingIdentifier(file.targetFilePath, binding.name),
                targetFilePath: file.targetFilePath,
                name: binding.name,
                line: binding.declarationNode.getStartLineNumber(),
                kind: binding.declarationNode.getKindName()
            };
        });
    });
}

type RetentionPaths = {
    readonly get: (identifier: string) => readonly RetentionStep[] | undefined;
    readonly set: (identifier: string, chain: readonly RetentionStep[]) => unknown;
};

type SeedEvent = Extract<TraceEvent, { readonly type: 'cross-bundle-seed-added' | 'local-seed-added'; }>;
type SymbolRetentionCollector = NonNullable<DeadCodeEliminationTrace>['collector'] & {
    readonly pathsForPackage: (packageName: string) => ReadonlyMap<string, readonly RetentionStep[]>;
};

function recordSeed(paths: RetentionPaths, event: SeedEvent, consumerPackage: string | undefined): void {
    paths.set(event.bindingIdentifier, [ { binding: event.bindingIdentifier, reason: event.reason, consumerPackage } ]);
}

function recordRetentionEvent(paths: RetentionPaths, event: TraceEvent): void {
    match(event)
        .with({ type: 'local-seed-added' }, function (seed) {
            recordSeed(paths, seed, undefined);
        })
        .with({ type: 'cross-bundle-seed-added' }, function (seed) {
            recordSeed(paths, seed, seed.sourceBundleName);
        })
        .with({ type: 'edge-added' }, function (edge) {
            const chain = paths.get(edge.fromBindingIdentifier);
            if (chain === undefined) {
                throw new Error(
                    `Missing retention proof for "${edge.fromBindingIdentifier}" in package "${edge.bundleName}"`
                );
            }
            paths.set(edge.toBindingIdentifier, [ ...chain, {
                binding: edge.toBindingIdentifier,
                reason: 'identifier-reference',
                consumerPackage: undefined
            } ]);
        })
        .otherwise(doNothing());
}

export function createSymbolRetentionCollector(): SymbolRetentionCollector {
    const packages = new Map<string, Map<string, readonly RetentionStep[]>>();
    return {
        record(event) {
            const paths = packages.get(event.bundleName) ?? new Map<string, readonly RetentionStep[]>();
            recordRetentionEvent(paths, event);
            packages.set(event.bundleName, paths);
        },
        pathsForPackage(packageName) {
            return packages.get(packageName) ?? new Map<string, readonly RetentionStep[]>();
        }
    };
}

function symbolReason(enabled: boolean, kept: boolean): InspectedSymbol['reason'] {
    if (!enabled) {
        return 'dead-code-elimination-disabled';
    }
    return kept ? 'reachable' : 'unreachable';
}

function compareSymbols(left: InspectedSymbol, right: InspectedSymbol): number {
    const pathComparison = left.packagePath.localeCompare(right.packagePath);
    if (pathComparison !== 0) {
        return pathComparison;
    }
    return left.name.localeCompare(right.name);
}

export function inspectBundleSymbols(
    transformationsEnabled: boolean,
    locations: readonly SymbolLocation[],
    analyzed: AnalyzedBundle,
    paths: ReadonlyMap<string, readonly RetentionStep[]>
): BundleSymbolInspection {
    const resources = new Map(analyzed.contents.map(function (resource) {
        return [ resource.fileDescription.targetFilePath, resource ];
    }));
    return {
        bundle: analyzed,
        symbols: locations
            .map(function (location): InspectedSymbol {
                const kept = resources.get(location.targetFilePath)?.analysis.survivingBindings.has(location.name) ??
                    false;
                return {
                    packagePath: `./${location.targetFilePath}`,
                    name: location.name,
                    line: location.line,
                    kind: location.kind,
                    decision: kept ? 'kept' : 'removed',
                    reason: symbolReason(transformationsEnabled, kept),
                    chain: paths.get(location.identifier) ?? []
                };
            })
            .toSorted(compareSymbols)
    };
}
