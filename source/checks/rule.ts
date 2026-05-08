import type { ZodMiniType } from 'zod/mini';
import type { LinkedBundle } from '../linker/linked-bundle.ts';

type RuleGlobalConfig = {
    readonly enabled: boolean;
};

export type RuleRunParams<TName extends string, TGlobal extends RuleGlobalConfig, TPerPackage> = {
    readonly bundles: readonly LinkedBundle[];
    readonly settings: Readonly<Partial<Record<TName, TGlobal | undefined>>> | undefined;
    readonly perPackageSettings: ReadonlyMap<
        string,
        Readonly<Partial<Record<TName, TPerPackage | undefined>>> | undefined
    >;
};

export type CheckRuleDefinition<TName extends string, TGlobal extends RuleGlobalConfig, TPerPackage> = {
    readonly name: TName;
    readonly globalSchema: ZodMiniType<TGlobal>;
    readonly perPackageSchema: ZodMiniType<TPerPackage>;
    readonly run: (params: RuleRunParams<TName, TGlobal, TPerPackage>) => readonly string[];
};
