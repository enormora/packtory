import { z, type ZodMiniType } from 'zod/mini';
import type { AnalyzedBundle } from '../dead-code-eliminator/analyzed-bundle.ts';

export const enabledOnlyGlobalSchema = z.strictObject({ enabled: z.boolean() });
export const emptyPerPackageSchema = z.strictObject({});

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
    readonly settings: Readonly<Partial<Record<TName, TGlobal | undefined>>> | undefined;
    readonly perPackageSettings: ReadonlyMap<
        string,
        Readonly<Partial<Record<TName, TPerPackage | undefined>>> | undefined
    >;
    readonly packageConfigs?: Readonly<Record<string, RulePackageConfig>>;
};

export type CheckRuleDefinition<TName extends string, TGlobal extends RuleGlobalConfig, TPerPackage> = {
    readonly name: TName;
    readonly globalSchema: ZodMiniType<TGlobal>;
    readonly perPackageSchema: ZodMiniType<TPerPackage>;
    readonly run: (params: RuleRunParams<TName, TGlobal, TPerPackage>) => readonly string[];
};
