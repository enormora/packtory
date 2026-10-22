import type { Packtory } from '../../packtory/packtory.ts';
import { renderTerminalPackageFiles } from '../../report/terminal-renderer/terminal-package-files-renderer.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { formatPackageInspectionFailure, runPackageInspectionHandler } from './package-inspection-handler.ts';

type PackageFilesFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};

export type PackageFilesHandlerDependencies = {
    readonly log: (message: string) => void;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
    readonly flags: PackageFilesFlags;
};

export async function runPackageFilesHandler(dependencies: PackageFilesHandlerDependencies): Promise<number> {
    const { configurationLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    return runPackageInspectionHandler({
        log,
        spinnerRenderer,
        async inspect() {
            return packtory.inspectPackageFiles(await configurationLoader.load(), flags.packageName);
        },
        renderFailure(error) {
            return formatPackageInspectionFailure({
                error,
                trace: flags.trace,
                title: 'Packtory files [Dry run]',
                fallback: 'Package files could not be inspected'
            });
        },
        renderSuccess: renderTerminalPackageFiles
    });
}
