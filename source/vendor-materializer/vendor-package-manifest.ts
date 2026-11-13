import parsePackageArgument from 'npm-package-arg';
import { Result, tryOr } from 'true-myth/result';
import { z } from 'zod/mini';
import { safeParse } from '../common/schema-validation.ts';

const dependencyMapSchema = z.optional(z.record(z.string(), z.string()));
const peerDependencyMetadataSchema = z.optional(
    z.record(
        z.string(),
        z.object({
            optional: z.optional(z.boolean())
        })
    )
);

type OptionalPeerMetadata = Readonly<Record<string, { readonly optional?: boolean | undefined; }>> | undefined;

function packageManifestSchema(): z.ZodMiniType<{
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependenciesMeta?: OptionalPeerMetadata;
}> {
    return z.object({
        dependencies: dependencyMapSchema,
        peerDependencies: dependencyMapSchema,
        peerDependenciesMeta: peerDependencyMetadataSchema
    });
}

export type ParsedManifestSummary = {
    readonly dependencies: readonly string[];
    readonly peers: readonly string[];
};

function getPackageArgumentName(name: string): string | undefined {
    const parsed = tryOr(undefined, function () {
        return parsePackageArgument(name).name ?? undefined;
    });
    return parsed.isOk ? parsed.value : undefined;
}

export function findFirstInvalidDependencyName(names: readonly string[]): string | undefined {
    for (const name of names) {
        if (getPackageArgumentName(name) !== name) {
            return name;
        }
    }
    return undefined;
}

export function parseManifestSummary(
    content: string
): Result<ParsedManifestSummary, string> {
    const parsed = safeParse(packageManifestSchema(), JSON.parse(content));
    if (!parsed.success) {
        return Result.ok({ dependencies: [], peers: [] });
    }
    const dependencyNames = Object.keys(parsed.data.dependencies ?? {});
    const peerDependencyNames = Object.keys(parsed.data.peerDependencies ?? {}).filter(function (peerDependencyName) {
        return parsed.data.peerDependenciesMeta?.[peerDependencyName]?.optional !== true;
    });
    const invalidDependencyName = findFirstInvalidDependencyName(dependencyNames.concat(peerDependencyNames));
    if (invalidDependencyName !== undefined) {
        return Result.err(invalidDependencyName);
    }
    return Result.ok({
        dependencies: dependencyNames,
        peers: peerDependencyNames
    });
}
