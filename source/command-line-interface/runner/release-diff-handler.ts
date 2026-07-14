import { succeededResultsFrom } from '../../packtory/partial-result.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import { buildReleaseDiffDocument, type ReleaseDiffDocument } from '../../report/release-diff/release-diff-document.ts';
import {
    renderFailureOnlyTerminalReleaseDiff,
    renderTerminalReleaseDiff
} from '../../report/terminal-renderer/terminal-release-diff-renderer.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';

type Logger = (message: string) => void;

export type ReleaseDiffHandlerDependencies = {
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
};

async function renderDocument(
    dependencies: Pick<ReleaseDiffHandlerDependencies, 'log' | 'pageOutput'>,
    document: ReleaseDiffDocument
): Promise<void> {
    if (document.previewable) {
        await dependencies.pageOutput(renderTerminalReleaseDiff(document));
        return;
    }
    dependencies.log(renderFailureOnlyTerminalReleaseDiff(document).trimEnd());
}

async function releaseDiff(dependencies: ReleaseDiffHandlerDependencies): Promise<number> {
    const { packtory, spinnerRenderer, configLoader } = dependencies;
    const config = await configLoader.load();
    const outcome = await packtory.diffAgainstLatestPublished(config);
    spinnerRenderer.stopAll();
    const document = buildReleaseDiffDocument({
        report: outcome.getReport(),
        result: outcome.result,
        packages: succeededResultsFrom(outcome.result)
    });
    await renderDocument(dependencies, document);
    return outcome.result.isErr ? 1 : 0;
}

export async function runReleaseDiffHandler(dependencies: ReleaseDiffHandlerDependencies): Promise<number> {
    try {
        return await releaseDiff(dependencies);
    } finally {
        dependencies.spinnerRenderer.stopAll();
    }
}
