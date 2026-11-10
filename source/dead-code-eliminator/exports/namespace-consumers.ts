import {
    Node as TypeScriptMorphNode,
    SyntaxKind,
    type CallExpression,
    type ExportDeclaration,
    type ImportDeclaration,
    type SourceFile
} from 'ts-morph';
import { dynamicImportSpecifier } from '../dynamic-import-specifier.ts';
import type { ExportTargetResolver } from './module-export-resolver.ts';

type ImportConsumer = { readonly type: 'import'; readonly declaration: ImportDeclaration; };
type ExportConsumer = { readonly type: 'export'; readonly declaration: ExportDeclaration; };
type DynamicConsumer = { readonly type: 'dynamic'; readonly call: CallExpression; };
export type NamespaceConsumer = DynamicConsumer | ExportConsumer | ImportConsumer;
export type NamespaceConsumers = {
    readonly consumers: ReadonlyMap<SourceFile, readonly NamespaceConsumer[]>;
    readonly unknownDynamic: boolean;
};

export function collectNamespaceConsumers(
    files: readonly SourceFile[],
    resolveModule: ExportTargetResolver
): NamespaceConsumers {
    const consumers = new Map<SourceFile, NamespaceConsumer[]>();
    let unknownDynamic = false;

    function addConsumer(target: SourceFile | undefined, consumer: NamespaceConsumer): void {
        if (target !== undefined) {
            const entries = consumers.get(target) ?? [];
            entries.push(consumer);
            consumers.set(target, entries);
        }
    }

    function scanDynamic(call: CallExpression): void {
        if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
            return;
        }
        const specifier = dynamicImportSpecifier(call);
        if (specifier === undefined) {
            unknownDynamic = true;
            return;
        }
        const target = resolveModule(call.getSourceFile(), specifier);
        if (target === undefined && !TypeScriptMorphNode.isStringLiteral(call.getArguments()[0])) {
            unknownDynamic = true;
        }
        addConsumer(target, { type: 'dynamic', call });
    }

    function scanSource(source: SourceFile): void {
        for (const declaration of source.getImportDeclarations()) {
            if (!declaration.isTypeOnly()) {
                addConsumer(resolveModule(source, declaration.getModuleSpecifierValue()), {
                    type: 'import',
                    declaration
                });
            }
        }
        for (const declaration of source.getExportDeclarations()) {
            const specifier = declaration.getModuleSpecifierValue();
            if (specifier !== undefined && !declaration.isTypeOnly()) {
                addConsumer(resolveModule(source, specifier), { type: 'export', declaration });
            }
        }
        source.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(scanDynamic);
    }

    files.forEach(scanSource);
    return { consumers, unknownDynamic };
}
