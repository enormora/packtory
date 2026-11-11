import { Node as TypeScriptMorphNode, SyntaxKind, type CallExpression, type SourceFile } from 'ts-morph';
import { isDefined, prop } from 'remeda';
import { match } from 'ts-pattern';
import { dynamicImportProperties } from '../reachability/dynamic-import-properties.ts';
import { dynamicImportSpecifier } from '../dynamic-import-specifier.ts';
import type { ModuleExportModel } from './module-export-model.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';
import type { ModuleGraphTargets } from './module-evaluation-dependencies.ts';
import type { NamespaceDemandAnalysis } from './namespace-demand-analysis.ts';

export type ModuleExportLinks = Pick<ModuleGraphTargets, 'binding' | 'exported'> & {
    readonly resolveModule: ExportTargetResolver;
    readonly namespaceTargets: (source: SourceFile, properties: ReadonlySet<string> | undefined) => readonly string[];
    readonly demand: NamespaceDemandAnalysis;
};

function starDependencies(model: ModuleExportModel, name: string, links: ModuleExportLinks): readonly string[] {
    if (name === 'default') {
        return [];
    }
    return model
        .stars
        .map(function (star) {
            const target = star.specifier === undefined ? undefined : links.resolveModule(model.source, star.specifier);
            return target === undefined ? undefined : links.exported(target, name);
        })
        .filter(isDefined);
}

export function moduleExportDependencies(
    model: ModuleExportModel,
    name: string,
    links: ModuleExportLinks
): readonly string[] {
    const entry = model.entries.get(name);
    if (entry === undefined) {
        return starDependencies(model, name, links);
    }
    return match(entry)
        .with({ kind: 'local' }, function (value) {
            return [ links.binding(model.source, value.local) ].filter(isDefined);
        })
        .with({ kind: 'forward' }, function (value) {
            return [ links.exported(links.resolveModule(model.source, value.specifier), value.name) ].filter(isDefined);
        })
        .otherwise(function (value) {
            const specifier = prop(value, 'specifier');
            const target = specifier === undefined
                ? undefined
                : links.resolveModule(model.source, specifier);
            return target === undefined
                ? []
                : links.namespaceTargets(target, links.demand.exportProperties(model.source, name));
        });
}

type DynamicImportLinks = Pick<ModuleExportLinks, 'namespaceTargets' | 'resolveModule'> & {
    readonly evaluated: ModuleGraphTargets['evaluated'];
    readonly sources: readonly SourceFile[];
};

function unknownDynamicDependencies(links: DynamicImportLinks): readonly string[] {
    return links
        .sources
        .filter(function (source) {
            return !source.isDeclarationFile();
        })
        .flatMap(function (source) {
            return [ links.evaluated(source), ...links.namespaceTargets(source, undefined) ].filter(isDefined);
        });
}

export function dynamicImportDependencies(
    call: CallExpression,
    links: DynamicImportLinks
): readonly string[] | undefined {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
        return undefined;
    }
    const specifier = dynamicImportSpecifier(call);
    if (specifier === undefined) {
        return unknownDynamicDependencies(links);
    }
    const source = links.resolveModule(call.getSourceFile(), specifier);
    if (source === undefined) {
        return TypeScriptMorphNode.isStringLiteral(call.getArguments()[0])
            ? undefined
            : unknownDynamicDependencies(links);
    }
    return [
        links.evaluated(source),
        ...links.namespaceTargets(source, dynamicImportProperties(call, source))
    ]
        .filter(isDefined);
}
