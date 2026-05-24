import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { createPreviewIo, type PreviewIo, type PreviewIoDependencies } from './preview-io-shared.ts';
import { defaultSpawnProcess } from './preview-spawn.ts';

type DefaultPreviewIoDependencies = Partial<Pick<PreviewIoDependencies, 'randomUuid' | 'spawnProcess' | 'tmpdir'>> &
    Pick<PreviewIoDependencies, 'openFile' | 'pager' | 'shell' | 'stdoutIsTTY'>;

export function createDefaultPreviewIo(dependencies: DefaultPreviewIoDependencies): PreviewIo {
    return createPreviewIo({
        openFile: dependencies.openFile,
        spawnProcess: dependencies.spawnProcess ?? defaultSpawnProcess,
        randomUuid: dependencies.randomUuid ?? randomUUID,
        tmpdir: dependencies.tmpdir ?? os.tmpdir,
        shell: dependencies.shell,
        pager: dependencies.pager,
        stdoutIsTTY: dependencies.stdoutIsTTY
    });
}
