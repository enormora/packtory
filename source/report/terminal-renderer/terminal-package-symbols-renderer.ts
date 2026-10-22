import type { PackageSymbolInspection } from '../../packtory/packtory-results.ts';

export function renderTerminalPackageSymbols(inspection: PackageSymbolInspection): string {
    return [
        'Packtory symbols [Dry run]',
        inspection.packageName,
        'Top-level bindings in linked package sources; locations refer to code before dead-code elimination.',
        ...inspection.symbols.length === 0
            ? [ 'No top-level symbols.' ]
            : inspection.symbols.flatMap(function (symbol) {
                return [
                    `${symbol.packagePath}:${symbol.line} ${symbol.name} (${symbol.kind}): ` +
                    `${symbol.decision} (${symbol.reason})`,
                    ...symbol.chain.map(function (step) {
                        const consumer = step.consumerPackage === undefined
                            ? ''
                            : ` from package "${step.consumerPackage}"`;
                        return `  ${step.binding}: ${step.reason}${consumer}`;
                    })
                ];
            })
    ]
        .join('\n');
}
