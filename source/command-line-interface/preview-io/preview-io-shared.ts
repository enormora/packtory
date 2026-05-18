/* eslint-disable no-undef -- the NodeJS namespace type is used for portable platform detection */
import path from 'node:path';
import { spawnDetached, spawnForCompletion, type SpawnFunction } from './preview-spawn.ts';

export type PreviewIoDependencies = {
    readonly spawnProcess: SpawnFunction;
    readonly randomUuid: () => string;
    readonly tmpdir: () => string;
    readonly platform: NodeJS.Platform;
    readonly shell: string | undefined;
    readonly pager: string | undefined;
    readonly stdoutIsTTY: boolean;
};

export type PreviewIo = {
    readonly createTemporaryPreviewHtmlPath: () => string;
    readonly pagePreviewOutput: (content: string) => Promise<boolean>;
    readonly openPreviewFile: (filePath: string) => Promise<boolean>;
};

export function createPreviewIo(dependencies: PreviewIoDependencies): PreviewIo {
    const shell = dependencies.shell ?? 'sh';

    return {
        createTemporaryPreviewHtmlPath() {
            return path.join(dependencies.tmpdir(), `packtory-preview-${dependencies.randomUuid()}.html`);
        },
        async pagePreviewOutput(content) {
            if (!dependencies.stdoutIsTTY) {
                return false;
            }
            if (dependencies.pager !== undefined && dependencies.pager !== '') {
                const didPage = await spawnForCompletion(
                    dependencies.spawnProcess,
                    shell,
                    ['-lc', dependencies.pager],
                    content
                );
                if (didPage) {
                    return true;
                }
            }
            return spawnForCompletion(dependencies.spawnProcess, shell, ['-lc', 'less -R'], content);
        },
        async openPreviewFile(filePath) {
            if (dependencies.platform === 'darwin') {
                return spawnDetached(dependencies.spawnProcess, 'open', [filePath]);
            }
            if (dependencies.platform === 'win32') {
                return spawnDetached(dependencies.spawnProcess, 'cmd', ['/c', 'start', '', filePath]);
            }
            return spawnDetached(dependencies.spawnProcess, 'xdg-open', [filePath]);
        }
    };
}
