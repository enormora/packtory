import type { FileManager } from '../../file-manager/file-manager.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import { buildPreviewDocument, type PreviewDocument } from '../../report/preview/preview-document.ts';
import { renderHtmlReport } from '../../report/html-renderer/html-renderer.ts';
import {
    renderFailureOnlyTerminalPreview,
    renderTerminalPreview
} from '../../report/terminal-renderer/terminal-preview-renderer.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import { createEmptyReport } from './report-persistence.ts';

type Logger = (message: string) => void;
type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;

export type PreviewHandlerDeps = {
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly openFile: (filePath: string) => Promise<boolean>;
    readonly createTemporaryFilePath: () => string;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly flags: { readonly open: boolean };
};

function isPreviewableResult(result: BuildOutcome['result']): boolean {
    return result.isOk || (result.error.type === 'partial' && result.error.succeeded.length > 0);
}

async function renderOpenedReport(
    deps: Pick<PreviewHandlerDeps, 'createTemporaryFilePath' | 'fileManager' | 'log' | 'openFile'>,
    document: PreviewDocument
): Promise<void> {
    const filePath = deps.createTemporaryFilePath();
    await deps.fileManager.writeFile(filePath, renderHtmlReport(document));
    const opened = await deps.openFile(filePath);
    if (!opened) {
        deps.log(filePath);
    }
}

async function renderInlinePreview(
    deps: Pick<PreviewHandlerDeps, 'log' | 'pageOutput'>,
    document: PreviewDocument,
    result: BuildOutcome['result']
): Promise<void> {
    if (isPreviewableResult(result)) {
        await deps.pageOutput(renderTerminalPreview(document));
    } else {
        deps.log(renderFailureOnlyTerminalPreview(document).trimEnd());
    }
}

async function renderDocument(
    deps: PreviewHandlerDeps,
    document: PreviewDocument,
    result: BuildOutcome['result']
): Promise<void> {
    await (deps.flags.open ? renderOpenedReport(deps, document) : renderInlinePreview(deps, document, result));
}

export async function runPreviewHandler(deps: PreviewHandlerDeps): Promise<number> {
    const { packtory, spinnerRenderer, configLoader, fileManager } = deps;
    try {
        const config = await configLoader.load();
        const outcome = await packtory.buildAndPublishAll(config, { dryRun: true, collectReport: true });
        spinnerRenderer.stopAll();
        const report = outcome.getReport() ?? createEmptyReport();
        const document = await buildPreviewDocument({
            report,
            result: outcome.result,
            dryRun: true,
            fileManager
        });
        await renderDocument(deps, document, outcome.result);
        return outcome.result.isErr ? 1 : 0;
    } finally {
        spinnerRenderer.stopAll();
    }
}
