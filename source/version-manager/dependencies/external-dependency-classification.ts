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

type SpecifierAccumulator = {
    readonly mutableOffenders: MutableOffender[];
    readonly malformedOffenders: MalformedOffender[];
    readonly usedAllowListEntries: Set<string>;
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

function recordClassification(
    entry: ExternalDependencyEntry,
    allowMutableSpecifiers: readonly string[],
    accumulator: SpecifierAccumulator
): void {
    const classification = classifySpecifier(entry.name, entry.version);
    if (classification.kind === 'malformed') {
        accumulator.malformedOffenders.push({
            name: entry.name,
            specifier: entry.version,
            reason: classification.reason
        });
        return;
    }
    if (classification.kind === 'mutable') {
        if (allowMutableSpecifiers.includes(entry.name)) {
            accumulator.usedAllowListEntries.add(entry.name);
        } else {
            accumulator.mutableOffenders.push({
                name: entry.name,
                specifier: entry.version,
                npaType: classification.npaType
            });
        }
    }
}

function throwHighestPriorityFailure(
    accumulator: SpecifierAccumulator,
    allowMutableSpecifiers: readonly string[]
): void {
    if (accumulator.malformedOffenders.length > 0) {
        throw new Error(renderMalformedSpecifierMessage(accumulator.malformedOffenders));
    }
    if (accumulator.mutableOffenders.length > 0) {
        throw new Error(renderMutableSpecifierMessage(accumulator.mutableOffenders));
    }
    const unusedAllowListEntries = allowMutableSpecifiers.filter((entry) => {
        return !accumulator.usedAllowListEntries.has(entry);
    });
    if (unusedAllowListEntries.length > 0) {
        throw new Error(renderUnusedAllowListMessage(unusedAllowListEntries));
    }
}

export function groupExternalDependencies(
    bundle: Pick<AnalyzedBundle, 'externalDependencies'>,
    mainPackageJson: MainPackageJson,
    allowMutableSpecifiers: readonly string[]
): Readonly<GroupedDependencies> {
    const grouped: GroupedDependencies = { dependencies: {}, peerDependencies: {} };
    const accumulator: SpecifierAccumulator = {
        mutableOffenders: [],
        malformedOffenders: [],
        usedAllowListEntries: new Set<string>()
    };

    for (const dependencyName of bundle.externalDependencies.keys()) {
        const entry = resolveExternalDependencyEntry(dependencyName, mainPackageJson);
        recordClassification(entry, allowMutableSpecifiers, accumulator);
        grouped[entry.kind][entry.name] = entry.version;
    }

    throwHighestPriorityFailure(accumulator, allowMutableSpecifiers);

    return grouped;
}
