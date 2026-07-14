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

export type PreviewHandlerDependencies = {
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly openFile: (filePath: string) => Promise<boolean>;
    readonly createTemporaryFilePath: () => string;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
    readonly fileManager: Pick<FileManager, 'readFile' | 'writeFile'>;
    readonly flags: { readonly open: boolean; };
};

async function renderOpenedReport(
    dependencies: Pick<PreviewHandlerDependencies, 'createTemporaryFilePath' | 'fileManager' | 'log' | 'openFile'>,
    document: PreviewDocument
): Promise<void> {
    const filePath = dependencies.createTemporaryFilePath();
    await dependencies.fileManager.writeFile(filePath, renderHtmlReport(document));
    const opened = await dependencies.openFile(filePath);
    if (!opened) {
        dependencies.log(filePath);
    }
}

async function renderInlinePreview(
    dependencies: Pick<PreviewHandlerDependencies, 'log' | 'pageOutput'>,
    document: PreviewDocument
): Promise<void> {
    if (document.previewable) {
        await dependencies.pageOutput(renderTerminalPreview(document));
    } else {
        dependencies.log(renderFailureOnlyTerminalPreview(document).trimEnd());
    }
}

async function renderDocument(dependencies: PreviewHandlerDependencies, document: PreviewDocument): Promise<void> {
    if (dependencies.flags.open) {
        await renderOpenedReport(dependencies, document);
        return;
    }
    await renderInlinePreview(dependencies, document);
}

async function preview(dependencies: PreviewHandlerDependencies): Promise<number> {
    const { packtory, spinnerRenderer, configLoader, fileManager } = dependencies;
    const config = await configLoader.load();
    const outcome = await packtory.buildAndPublishAll(config, { dryRun: true, stage: false, collectReport: true });
    spinnerRenderer.stopAll();
    const report = outcome.getReport() ?? createEmptyReport();
    const document = await buildPreviewDocument({
        report,
        result: outcome.result,
        dryRun: true,
        fileManager
    });
    await renderDocument(dependencies, document);
    return outcome.result.isErr ? 1 : 0;
}

export async function runPreviewHandler(dependencies: PreviewHandlerDependencies): Promise<number> {
    try {
        return await preview(dependencies);
    } finally {
        dependencies.spinnerRenderer.stopAll();
    }
}
