import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { createPreviewIo, defaultSpawnProcess } from './preview-io-shared.ts';

export const previewIo = createPreviewIo({
    spawnProcess: defaultSpawnProcess,
    randomUuid: randomUUID,
    tmpdir: os.tmpdir,
    platform: process.platform,
    // eslint-disable-next-line node/no-process-env -- preview pager/open behavior is intentionally driven by the caller environment
    shell: process.env.SHELL,
    // eslint-disable-next-line node/no-process-env -- preview pager/open behavior is intentionally driven by the caller environment
    pager: process.env.PAGER,
    stdoutIsTTY: process.stdout.isTTY
});
