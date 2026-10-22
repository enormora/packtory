import type { Packtory } from '../../packtory/packtory.ts';
import {
    renderTerminalPackageDependencies
} from '../../report/terminal-renderer/terminal-package-dependencies-renderer.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { formatPackageInspectionFailure, runPackageInspectionHandler } from './package-inspection-handler.ts';

type PackageDependenciesFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};

export type PackageDependenciesHandlerDependencies = {
    readonly log: (message: string) => void;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
    readonly flags: PackageDependenciesFlags;
};

export async function runPackageDependenciesHandler(
    dependencies: PackageDependenciesHandlerDependencies
): Promise<number> {
    const { configurationLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    return runPackageInspectionHandler({
        log,
        spinnerRenderer,
        async inspect() {
            return packtory.inspectPackageDependencies(await configurationLoader.load(), flags.packageName);
        },
        renderFailure(error) {
            return formatPackageInspectionFailure({
                error,
                trace: flags.trace,
                title: 'Packtory dependency reasons [Dry run]',
                fallback: 'Package dependencies could not be inspected'
            });
        },
        renderSuccess: renderTerminalPackageDependencies
    });
}
