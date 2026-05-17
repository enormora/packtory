import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { createPreviewIo, defaultSpawnProcess, type PreviewIo, type PreviewIoDependencies } from './preview-io-shared.ts';

type DefaultPreviewIoDependencies = Pick<PreviewIoDependencies, 'platform' | 'shell' | 'pager' | 'stdoutIsTTY'> &
    Partial<Pick<PreviewIoDependencies, 'spawnProcess' | 'randomUuid' | 'tmpdir'>>;

export function createDefaultPreviewIo(dependencies: DefaultPreviewIoDependencies): PreviewIo {
    return createPreviewIo({
        spawnProcess: dependencies.spawnProcess ?? defaultSpawnProcess,
        randomUuid: dependencies.randomUuid ?? randomUUID,
        tmpdir: dependencies.tmpdir ?? os.tmpdir,
        platform: dependencies.platform,
        shell: dependencies.shell,
        pager: dependencies.pager,
        stdoutIsTTY: dependencies.stdoutIsTTY
    });
}
