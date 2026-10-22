import type { Packtory } from '../../packtory/packtory.ts';
import { renderTerminalPackageSymbols } from '../../report/terminal-renderer/terminal-package-symbols-renderer.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { formatPackageInspectionFailure, runPackageInspectionHandler } from './package-inspection-handler.ts';

type PackageSymbolsFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};

export type PackageSymbolsHandlerDependencies = {
    readonly log: (message: string) => void;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
    readonly flags: PackageSymbolsFlags;
};

export async function runPackageSymbolsHandler(dependencies: PackageSymbolsHandlerDependencies): Promise<number> {
    const { configurationLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    return runPackageInspectionHandler({
        log,
        spinnerRenderer,
        async inspect() {
            return packtory.inspectPackageSymbols(await configurationLoader.load(), flags.packageName);
        },
        renderFailure(error) {
            return formatPackageInspectionFailure({
                error,
                trace: flags.trace,
                title: 'Packtory symbols [Dry run]',
                fallback: 'Package symbols could not be inspected'
            });
        },
        renderSuccess: renderTerminalPackageSymbols
    });
}
