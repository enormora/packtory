import { randomUUID as createUniqueIdentifier } from 'node:crypto';
import operatingSystem from 'node:os';
import {
    createPreviewInputOutput,
    type PreviewInputOutput,
    type PreviewInputOutputDependencies
} from './preview-input-output-shared.ts';
import { defaultSpawnProcess } from './preview-spawn.ts';

type OptionalPreviewSettings = Partial<
    Pick<PreviewInputOutputDependencies, 'randomUniqueIdentifier' | 'spawnProcess' | 'temporaryDirectory'>
>;

type RequiredPreviewSettings = Pick<
    PreviewInputOutputDependencies,
    'openFile' | 'pager' | 'shell' | 'standardOutputIsTerminal'
>;

type PreviewSettings = OptionalPreviewSettings & RequiredPreviewSettings;

export function createDefaultPreviewInputOutput(
    dependencies: PreviewSettings
): PreviewInputOutput {
    return createPreviewInputOutput({
        openFile: dependencies.openFile,
        spawnProcess: dependencies.spawnProcess ?? defaultSpawnProcess,
        randomUniqueIdentifier: dependencies.randomUniqueIdentifier ?? createUniqueIdentifier,
        temporaryDirectory: dependencies.temporaryDirectory ?? operatingSystem.tmpdir,
        shell: dependencies.shell,
        pager: dependencies.pager,
        standardOutputIsTerminal: dependencies.standardOutputIsTerminal
    });
}
