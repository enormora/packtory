import { z, type ZodMiniType } from 'zod/mini';
import { nonEmptyStringSchema } from '../configuration/base-validations.ts';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';
import type { PublishedPackageWithManifest } from '../published-package/published-package.ts';

export const enabledOnlyGlobalSchema = z.strictObject({ enabled: z.boolean() });
export const emptyPerPackageSchema = z.strictObject({});

const pathAllowListShape = {
    allowList: z.optional(z.readonly(z.array(nonEmptyStringSchema)))
};

export const pathAllowListGlobalSchema = z.strictObject({
    enabled: z.boolean(),
    ...pathAllowListShape
});

export const pathAllowListPerPackageSchema = z.strictObject(pathAllowListShape);

type RuleGlobalConfiguration = {
    readonly enabled: boolean;
};

type MainPackageManifestShape = {
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly devDependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
};

export type RulePackageConfiguration = {
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
    readonly mainPackageManifest?: MainPackageManifestShape | undefined;
};

export type RuleRunInput<TName extends string, TGlobal extends RuleGlobalConfiguration, TPerPackage> = {
    readonly bundles: readonly AnalyzedBundle[];
    readonly sourceFolders: ReadonlyMap<string, string>;
    readonly publishedPackages?: ReadonlyMap<string, PublishedPackageWithManifest> | undefined;
    readonly settings: Readonly<Partial<Readonly<Record<TName, TGlobal | undefined>>>> | undefined;
    readonly perPackageSettings: ReadonlyMap<
        string,
        Readonly<Partial<Readonly<Record<TName, TPerPackage | undefined>>>> | undefined
    >;
    readonly packageConfigurations?: Readonly<Record<string, RulePackageConfiguration>>;
};

export type CheckRuleDefinition<TName extends string, TGlobal extends RuleGlobalConfiguration, TPerPackage> = {
    readonly name: TName;
    readonly globalSchema: ZodMiniType<TGlobal>;
    readonly perPackageSchema: ZodMiniType<TPerPackage>;
    readonly run: (input: RuleRunInput<TName, TGlobal, TPerPackage>) => Promise<readonly string[]>;
};
