import { oneLine } from 'common-tags';
import type { AnalyzedBundle } from '../../dead-code-eliminator/analyzed-bundle.ts';
import type { MainPackageJson } from '../../config/package-json.ts';
import { classifySpecifier } from '../specifier-classifier.ts';
import {
    renderMalformedSpecifierMessage,
    renderMutableSpecifierMessage,
    renderUnusedAllowListMessage,
    type MalformedOffender,
    type MutableOffender
} from '../specifier-errors.ts';
import type { GroupedDependencies } from './dependency-groups.ts';

type ExternalDependencyEntry = {
    readonly name: string;
    readonly version: string;
    readonly kind: 'dependencies' | 'peerDependencies';
};

function getVersionFromDependencies(
    moduleName: string,
    mainPackageJson: MainPackageJson,
    kind: 'dependencies' | 'peerDependencies'
): string {
    const dependencies = { ...mainPackageJson[kind] };
    return String(dependencies[moduleName]);
}

function resolveExternalDependencyEntry(
    dependencyName: string,
    mainPackageJson: MainPackageJson
): ExternalDependencyEntry {
    const isPeer = mainPackageJson.peerDependencies?.[dependencyName] !== undefined;
    const isDirect = mainPackageJson.dependencies?.[dependencyName] !== undefined;

    if (!isPeer && !isDirect) {
        throw new Error(
            oneLine`Couldn’t determine version number of ${dependencyName},
                because it is not listed in the main package.json`
        );
    }

    const kind = isPeer ? 'peerDependencies' : 'dependencies';
    return {
        name: dependencyName,
        version: getVersionFromDependencies(dependencyName, mainPackageJson, kind),
        kind
    };
}

function createDependencyRecord(): Record<string, string> {
    return {};
}

function throwHighestPriorityFailure(
    mutableOffenders: readonly MutableOffender[],
    malformedOffenders: readonly MalformedOffender[],
    usedAllowListEntries: ReadonlySet<string>,
    allowMutableSpecifiers: readonly string[]
): void {
    if (malformedOffenders.length > 0) {
        throw new Error(renderMalformedSpecifierMessage(malformedOffenders));
    }
    if (mutableOffenders.length > 0) {
        throw new Error(renderMutableSpecifierMessage(mutableOffenders));
    }
    const unusedAllowListEntries = allowMutableSpecifiers.filter(function (entry) {
        return !usedAllowListEntries.has(entry);
    });
    if (unusedAllowListEntries.length > 0) {
        throw new Error(renderUnusedAllowListMessage(unusedAllowListEntries));
    }
}

type OffenderCollector<TOffender> = {
    readonly push: (offender: TOffender) => unknown;
};

type UsedAllowListEntryCollector = {
    readonly add: (entry: string) => unknown;
};

type ClassificationRecorders = {
    readonly allowMutableSpecifiers: readonly string[];
    readonly malformedOffenders: OffenderCollector<MalformedOffender>;
    readonly mutableOffenders: OffenderCollector<MutableOffender>;
    readonly usedAllowListEntries: UsedAllowListEntryCollector;
};

function recordClassification(entry: ExternalDependencyEntry, recorders: ClassificationRecorders): void {
    const classification = classifySpecifier(entry.name, entry.version);
    if (classification.kind === 'malformed') {
        recorders.malformedOffenders.push({
            name: entry.name,
            specifier: entry.version,
            reason: classification.reason
        });
        return;
    }
    if (classification.kind === 'mutable') {
        if (recorders.allowMutableSpecifiers.includes(entry.name)) {
            recorders.usedAllowListEntries.add(entry.name);
        } else {
            recorders.mutableOffenders.push({
                name: entry.name,
                specifier: entry.version,
                npaType: classification.npaType
            });
        }
    }
}

export function groupExternalDependencies(
    bundle: Pick<AnalyzedBundle, 'externalDependencies'>,
    mainPackageJson: MainPackageJson,
    allowMutableSpecifiers: readonly string[]
): GroupedDependencies {
    const grouped = {
        dependencies: createDependencyRecord(),
        peerDependencies: createDependencyRecord()
    };
    const mutableOffenders: MutableOffender[] = [];
    const malformedOffenders: MalformedOffender[] = [];
    const usedAllowListEntries = new Set<string>();

    for (const dependencyName of bundle.externalDependencies.keys()) {
        const entry = resolveExternalDependencyEntry(dependencyName, mainPackageJson);
        recordClassification(entry, {
            allowMutableSpecifiers,
            mutableOffenders,
            malformedOffenders,
            usedAllowListEntries
        });
        grouped[entry.kind][entry.name] = entry.version;
    }

    throwHighestPriorityFailure(mutableOffenders, malformedOffenders, usedAllowListEntries, allowMutableSpecifiers);

    return grouped;
}
