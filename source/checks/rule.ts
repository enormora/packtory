import { z, type ZodMiniType } from 'zod/mini';
import { nonEmptyStringSchema } from '../config/base-validations.ts';
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

type RuleGlobalConfig = {
    readonly enabled: boolean;
};

type MainPackageJsonShape = {
    readonly dependencies?: Readonly<Record<string, string>> | undefined;
    readonly devDependencies?: Readonly<Record<string, string>> | undefined;
    readonly peerDependencies?: Readonly<Record<string, string>> | undefined;
};

export type RulePackageConfig = {
    readonly bundleDependencies?: readonly string[] | undefined;
    readonly bundlePeerDependencies?: readonly string[] | undefined;
    readonly mainPackageJson?: MainPackageJsonShape | undefined;
};

export type RuleRunParams<TName extends string, TGlobal extends RuleGlobalConfig, TPerPackage> = {
    readonly bundles: readonly AnalyzedBundle[];
    readonly publishedPackages?: ReadonlyMap<string, PublishedPackageWithManifest> | undefined;
    readonly settings: Readonly<Partial<Readonly<Record<TName, TGlobal | undefined>>>> | undefined;
    readonly perPackageSettings: ReadonlyMap<
        string,
        Readonly<Partial<Readonly<Record<TName, TPerPackage | undefined>>>> | undefined
    >;
    readonly packageConfigs?: Readonly<Record<string, RulePackageConfig>>;
};

export type CheckRuleDefinition<TName extends string, TGlobal extends RuleGlobalConfig, TPerPackage> = {
    readonly name: TName;
    readonly globalSchema: ZodMiniType<TGlobal>;
    readonly perPackageSchema: ZodMiniType<TPerPackage>;
    readonly run: (params: RuleRunParams<TName, TGlobal, TPerPackage>) => Promise<readonly string[]>;
};
