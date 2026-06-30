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

export type ReleaseDiffHandlerDeps = {
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
};

async function renderDocument(
    deps: Pick<ReleaseDiffHandlerDeps, 'log' | 'pageOutput'>,
    document: ReleaseDiffDocument
): Promise<void> {
    if (document.previewable) {
        await deps.pageOutput(renderTerminalReleaseDiff(document));
        return;
    }
    deps.log(renderFailureOnlyTerminalReleaseDiff(document).trimEnd());
}

async function releaseDiff(deps: ReleaseDiffHandlerDeps): Promise<number> {
    const { packtory, spinnerRenderer, configLoader } = deps;
    const config = await configLoader.load();
    const outcome = await packtory.diffAgainstLatestPublished(config);
    spinnerRenderer.stopAll();
    const document = buildReleaseDiffDocument({
        report: outcome.getReport(),
        result: outcome.result,
        packages: succeededResultsFrom(outcome.result)
    });
    await renderDocument(deps, document);
    return outcome.result.isErr ? 1 : 0;
}

export async function runReleaseDiffHandler(deps: ReleaseDiffHandlerDeps): Promise<number> {
    try {
        return await releaseDiff(deps);
    } finally {
        deps.spinnerRenderer.stopAll();
    }
}
