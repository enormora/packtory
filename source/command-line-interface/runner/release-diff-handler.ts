import type { Packtory, ReleaseDiffAllResult } from '../../packtory/packtory.ts';
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

function succeededPackagesFrom(result: ReleaseDiffAllResult): readonly ReleaseDiffDocument['packages'][number][] {
    if (result.isOk) {
        return result.value;
    }
    if (result.error.type === 'partial') {
        return result.error.succeeded;
    }
    return [];
}

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

export async function runReleaseDiffHandler(deps: ReleaseDiffHandlerDeps): Promise<number> {
    const { packtory, spinnerRenderer, configLoader } = deps;
    try {
        const config = await configLoader.load();
        const outcome = await packtory.diffAgainstLatestPublished(config);
        spinnerRenderer.stopAll();
        const document = buildReleaseDiffDocument({
            report: outcome.getReport(),
            result: outcome.result,
            packages: succeededPackagesFrom(outcome.result)
        });
        await renderDocument(deps, document);
        return outcome.result.isErr ? 1 : 0;
    } finally {
        spinnerRenderer.stopAll();
    }
}
