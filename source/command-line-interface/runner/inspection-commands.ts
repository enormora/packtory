import type { Except } from 'type-fest';
import { flag, positional, string } from 'cmd-ts';
import { defineCommand, defineCommandGroup } from '../command-definition.ts';
import { runPackageDependenciesHandler } from './package-dependencies-handler.ts';
import { runPackageFilesHandler, type PackageFilesHandlerDependencies } from './package-files-handler.ts';
import { runPackageSideEffectsHandler } from './package-side-effects-handler.ts';
import { runPackageSymbolsHandler } from './package-symbols-handler.ts';
import { runReleaseDiffHandler } from './release-diff-handler.ts';

type InspectionCommandsDependencies = Except<PackageFilesHandlerDependencies, 'flags'> & {
    readonly getTraceEnabled: () => boolean;
    readonly recordExitCode: (exitCode: number) => void;
    readonly pageOutput: (content: string) => Promise<void>;
};
type PackageArguments = { readonly packageName: ReturnType<typeof positional<typeof string>>; };
type PackageValues = { readonly packageName: string; };
type PackageCommand = Readonly<
    ReturnType<typeof defineCommand<PackageArguments, (values: PackageValues) => Promise<void>>>
>;
type ChangesArguments = PackageArguments & { readonly filesOnly: ReturnType<typeof flag>; };
type ChangesValues = PackageValues & { readonly filesOnly: boolean; };
type ChangesCommand = Readonly<
    ReturnType<typeof defineCommand<ChangesArguments, (values: ChangesValues) => Promise<void>>>
>;
type InspectionCommands = Readonly<Record<'dependencies' | 'files' | 'side-effects' | 'symbols', PackageCommand>> & {
    readonly changes: ChangesCommand;
};

const changesCommandName = 'changes';
const dependenciesCommandName = 'dependencies';
const filesCommandName = 'files';
const sideEffectsCommandName = 'side-effects';
const symbolsCommandName = 'symbols';
export const inspectionCommandName = 'inspect';

export function createInspectionCommands(
    dependencies: InspectionCommandsDependencies
): ReturnType<typeof defineCommandGroup<InspectionCommands>> {
    function packageInspectionCommand(
        name: string,
        description: string,
        inspect: (input: PackageFilesHandlerDependencies) => Promise<number>
    ): PackageCommand {
        return defineCommand({
            name,
            description,
            arguments: { packageName: positional({ type: string, displayName: 'package' }) },
            async handler({ packageName }) {
                dependencies.recordExitCode(
                    await inspect({
                        ...dependencies,
                        flags: { packageName, trace: dependencies.getTraceEnabled() }
                    })
                );
            }
        });
    }
    return defineCommandGroup({
        name: inspectionCommandName,
        commands: {
            [dependenciesCommandName]: packageInspectionCommand(
                dependenciesCommandName,
                'Prints why final manifest dependencies are emitted for one package.',
                runPackageDependenciesHandler
            ),
            [filesCommandName]: packageInspectionCommand(
                filesCommandName,
                'Prints source discovery chains for retained files in one package.',
                runPackageFilesHandler
            ),
            [sideEffectsCommandName]: packageInspectionCommand(
                sideEffectsCommandName,
                'Prints why package.json sideEffects is false, listed, or omitted.',
                runPackageSideEffectsHandler
            ),
            [symbolsCommandName]: packageInspectionCommand(
                symbolsCommandName,
                'Prints why top-level symbols are kept or removed in one package.',
                runPackageSymbolsHandler
            ),
            [changesCommandName]: defineCommand({
                name: changesCommandName,
                description: 'Compares one package with its latest published tarball.',
                arguments: {
                    packageName: positional({ type: string, displayName: 'package' }),
                    filesOnly: flag({ long: 'files-only' })
                },
                async handler({ packageName, filesOnly }) {
                    dependencies.recordExitCode(
                        await runReleaseDiffHandler({
                            ...dependencies,
                            flags: { filesOnly, packageName }
                        })
                    );
                }
            })
        }
    });
}
