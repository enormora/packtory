import type { Packtory } from '../../packtory/packtory.ts';
import {
    renderTerminalPackageSideEffects
} from '../../report/terminal-renderer/terminal-package-side-effects-renderer.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { formatPackageInspectionFailure, runPackageInspectionHandler } from './package-inspection-handler.ts';

type PackageSideEffectsFlags = {
    readonly packageName: string;
    readonly trace: boolean;
};

export type PackageSideEffectsHandlerDependencies = {
    readonly log: (message: string) => void;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
    readonly flags: PackageSideEffectsFlags;
};

export async function runPackageSideEffectsHandler(
    dependencies: PackageSideEffectsHandlerDependencies
): Promise<number> {
    const { configurationLoader, flags, log, packtory, spinnerRenderer } = dependencies;
    return runPackageInspectionHandler({
        log,
        spinnerRenderer,
        async inspect() {
            return packtory.inspectPackageSideEffects(await configurationLoader.load(), flags.packageName);
        },
        renderFailure(error) {
            return formatPackageInspectionFailure({
                error,
                trace: flags.trace,
                title: 'Packtory side effects [Dry run]',
                fallback: 'Package side effects could not be inspected'
            });
        },
        renderSuccess: renderTerminalPackageSideEffects
    });
}
