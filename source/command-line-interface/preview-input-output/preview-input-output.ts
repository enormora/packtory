import { randomUUID as createUniqueIdentifier } from 'node:crypto';
import operatingSystem from 'node:os';
import { spawn } from 'node:child_process';
import {
    createPreviewInputOutput,
    type PreviewInputOutput,
    type PreviewInputOutputDependencies
} from './preview-input-output-shared.ts';
import { createPreviewProcessSpawner } from './preview-process.ts';

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
        spawnProcess: dependencies.spawnProcess ?? createPreviewProcessSpawner(spawn),
        randomUniqueIdentifier: dependencies.randomUniqueIdentifier ?? createUniqueIdentifier,
        temporaryDirectory: dependencies.temporaryDirectory ?? operatingSystem.tmpdir,
        shell: dependencies.shell,
        pager: dependencies.pager,
        standardOutputIsTerminal: dependencies.standardOutputIsTerminal
    });
}
