import path from 'node:path';
import { spawnForCompletion, type SpawnFunction } from './preview-spawn.ts';

export type PreviewIoDependencies = {
    readonly openFile: (filePath: string) => Promise<void>;
    readonly spawnProcess: SpawnFunction;
    readonly randomUuid: () => string;
    readonly pager: string | undefined;
    readonly shell: string | undefined;
    readonly stdoutIsTTY: boolean;
    readonly tmpdir: () => string;
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
            try {
                await dependencies.openFile(filePath);
                return true;
            } catch {
                return false;
            }
        }
    };
}
