import parsePackageArgument from 'npm-package-arg';
import { isArray } from 'remeda';
import { subset, validRange } from 'semver';
import { z } from 'zod/mini';
import { safeParse } from '../common/schema-validation.ts';
import { compareValues } from '../common/sort-values.ts';

const dependencyMapSchema = z.optional(z.record(z.string(), z.string()));
const enginesSchema = z.union([
    z.object({ node: z.optional(z.string()) }),
    z.readonly(z.array(z.string()))
]);
const manifestSchema = z.object({
    version: z.optional(z.string()),
    engines: z.optional(enginesSchema),
    dependencies: dependencyMapSchema,
    optionalDependencies: dependencyMapSchema,
    peerDependencies: dependencyMapSchema,
    peerDependenciesMeta: z.optional(z.record(z.string(), z.object({ optional: z.optional(z.boolean()) })))
});

export type NodeEngineManifest = {
    readonly nodeRange: string | undefined;
    readonly version: string | undefined;
    readonly requiredDependencyNames: readonly string[];
};

function validateDependencyName(name: string): void {
    if (parsePackageArgument(name).name !== name) {
        throw new Error(`Invalid dependency name "${name}"`);
    }
}

export function validateNodeRange(range: unknown): string {
    if (typeof range !== 'string' || range.trim() === '' || validRange(range) === null) {
        throw new Error(`Invalid engines.node requirement: ${JSON.stringify(range)}`);
    }
    return range;
}

export function supportsNodeRange(packageRange: string, dependencyRange: string): boolean {
    return subset(packageRange, dependencyRange, { includePrerelease: true });
}

function readLegacyEngine(requirement: string): readonly [string, string] {
    const normalized = requirement.trim();
    const boundary = normalized.search(/\s/u);
    if (boundary === -1) {
        throw new Error(`Invalid legacy engine requirement: ${JSON.stringify(requirement)}`);
    }
    return [ normalized.slice(0, boundary), validateNodeRange(normalized.slice(boundary).trim()) ];
}

function readLegacyNodeRange(requirements: readonly string[]): string | undefined {
    const engines = new Map(requirements.map(readLegacyEngine));
    if (engines.size !== requirements.length) {
        throw new Error('Duplicate legacy engine requirements');
    }
    return engines.get('node');
}

function readNodeRange(engines: Readonly<z.infer<typeof enginesSchema>> | undefined): string | undefined {
    return isArray(engines) ? readLegacyNodeRange(engines) : engines?.node;
}

export function readNodeEngineManifest(manifest: unknown): NodeEngineManifest {
    const result = safeParse(manifestSchema, manifest);
    if (!result.success) {
        throw result.error;
    }
    const parsed = result.data;
    const dependencies = Object.keys(parsed.dependencies ?? {}).filter(function (name) {
        return !Object.hasOwn(parsed.optionalDependencies ?? {}, name);
    });
    const peers = Object.keys(parsed.peerDependencies ?? {}).filter(function (name) {
        return parsed.peerDependenciesMeta?.[name]?.optional !== true;
    });
    const requiredDependencyNames = Array.from(new Set([ ...dependencies, ...peers ])).toSorted(compareValues);
    for (const name of requiredDependencyNames) {
        validateDependencyName(name);
    }
    return {
        nodeRange: readNodeRange(parsed.engines),
        version: parsed.version,
        requiredDependencyNames
    };
}
