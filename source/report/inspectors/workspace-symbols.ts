import { Node as MorphNode, type SourceFile, type Symbol as MorphSymbol } from 'ts-morph';
import { createWorklist } from '../../common/worklist.ts';

const ambiguousExportDiagnosticCode = 2308;

export type ModuleSymbols = {
    readonly values: readonly string[];
    readonly types: readonly string[];
    readonly complete: boolean;
};

function alphabetical(left: string, right: string): number {
    return left.localeCompare(right);
}

function isTypeOnly(symbol: MorphSymbol): boolean {
    const declaration = symbol.getDeclarations().at(0);
    return MorphNode.isExportSpecifier(declaration) &&
        (declaration.isTypeOnly() || declaration.getExportDeclaration().isTypeOnly());
}

function resolvedSymbol(symbol: MorphSymbol): MorphSymbol {
    return symbol.getAliasedSymbol() ?? symbol;
}

function isTypeDeclaration(declaration: MorphNode): boolean {
    return MorphNode.isInterfaceDeclaration(declaration) || MorphNode.isTypeAliasDeclaration(declaration) || MorphNode
        .isClassDeclaration(declaration) ||
        MorphNode.isEnumDeclaration(declaration);
}

function forwardedModules(source: SourceFile): ReadonlySet<SourceFile | undefined> {
    return new Set(
        source
            .getExportDeclarations()
            .filter(function (declaration) {
                return declaration.getModuleSpecifierValue() !== undefined;
            })
            .map(function (declaration) {
                return declaration.getModuleSpecifierSourceFile();
            })
    );
}

function exportsAreResolved(source: SourceFile): boolean {
    const remaining = new Set(source.getProject().getSourceFiles());
    const pending = createWorklist([ source ]);
    for (let current = pending.takeNext(); current !== undefined; current = pending.takeNext()) {
        remaining.delete(current);
        const targets = forwardedModules(current);
        if (current.getFilePath().endsWith('.cjs') || targets.has(undefined)) {
            return false;
        }
        pending.scheduleAll(remaining.intersection(targets));
    }
    return true;
}

function hasExportConflict(source: SourceFile): boolean {
    return source.getPreEmitDiagnostics().some(function (diagnostic) {
        return diagnostic.getCode() === ambiguousExportDiagnosticCode;
    });
}

export function inspectModuleSymbols(source: SourceFile | undefined): ModuleSymbols {
    if (source === undefined || hasExportConflict(source)) {
        return { values: [], types: [], complete: false };
    }
    const symbols = source.getExportSymbols();
    return {
        values: symbols
            .filter(function (symbol) {
                return !isTypeOnly(symbol) && resolvedSymbol(symbol).getValueDeclaration() !== undefined;
            })
            .map(function (symbol) {
                return symbol.getName();
            })
            .toSorted(alphabetical),
        types: symbols
            .filter(function (symbol) {
                return resolvedSymbol(symbol).getDeclarations().some(isTypeDeclaration);
            })
            .map(function (symbol) {
                return symbol.getName();
            })
            .toSorted(alphabetical),
        complete: exportsAreResolved(source) && symbols.every(function (symbol) {
            return resolvedSymbol(symbol).getDeclarations().length > 0;
        })
    };
}
