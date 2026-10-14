import path from 'node:path';
import { spawnForCompletion, type SpawnFunction } from './preview-spawn.ts';

export type PreviewInputOutputDependencies = {
    readonly openFile: (filePath: string) => Promise<void>;
    readonly spawnProcess: SpawnFunction;
    readonly randomUniqueIdentifier: () => string;
    readonly pager: string | undefined;
    readonly shell: string | undefined;
    readonly standardOutputIsTerminal: boolean;
    readonly temporaryDirectory: () => string;
};

export type PreviewInputOutput = {
    readonly createTemporaryPreviewHypertextMarkupLanguagePath: () => string;
    readonly pagePreviewOutput: (content: string) => Promise<boolean>;
    readonly openPreviewFile: (filePath: string) => Promise<boolean>;
};

export function createPreviewInputOutput(dependencies: PreviewInputOutputDependencies): PreviewInputOutput {
    const shell = dependencies.shell ?? 'sh';

    return {
        createTemporaryPreviewHypertextMarkupLanguagePath() {
            return path.join(
                dependencies.temporaryDirectory(),
                `packtory-preview-${dependencies.randomUniqueIdentifier()}.html`
            );
        },
        async pagePreviewOutput(content) {
            if (!dependencies.standardOutputIsTerminal) {
                return false;
            }
            if (dependencies.pager !== undefined && dependencies.pager !== '') {
                const didPage = await spawnForCompletion(
                    dependencies.spawnProcess,
                    shell,
                    [ '-lc', dependencies.pager ],
                    content
                );
                if (didPage) {
                    return true;
                }
            }
            return spawnForCompletion(dependencies.spawnProcess, shell, [ '-lc', 'less -R' ], content);
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
