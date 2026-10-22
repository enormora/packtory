import { validateConfiguration } from '../../configuration/validation.ts';
import { succeededResultsFrom } from '../../packtory/partial-result.ts';
import type { Packtory } from '../../packtory/packtory.ts';
import { buildReleaseDiffDocument, type ReleaseDiffDocument } from '../../report/release-diff/release-diff-document.ts';
import {
    renderFailureOnlyTerminalReleaseDiff,
    renderTerminalReleaseDiff
} from '../../report/terminal-renderer/terminal-release-diff-renderer.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';

type Logger = (message: string) => void;

type ReleaseDiffFlags = {
    readonly filesOnly: boolean;
    readonly packageName: string | undefined;
};

export type ReleaseDiffHandlerDependencies = {
    readonly log: Logger;
    readonly pageOutput: (content: string) => Promise<void>;
    readonly packtory: Packtory;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
    readonly flags: ReleaseDiffFlags;
};

async function renderDocument(
    dependencies: Pick<ReleaseDiffHandlerDependencies, 'flags' | 'log' | 'pageOutput'>,
    document: ReleaseDiffDocument
): Promise<void> {
    if (document.previewable) {
        await dependencies.pageOutput(renderTerminalReleaseDiff(document, {
            filesOnly: dependencies.flags.filesOnly
        }));
        return;
    }
    dependencies.log(renderFailureOnlyTerminalReleaseDiff(document).trimEnd());
}

function isUnknownPackage(configuration: unknown, packageName: string | undefined): boolean {
    if (packageName === undefined) {
        return false;
    }
    const validation = validateConfiguration(configuration);
    return validation.isOk && validation.value.packtoryConfiguration.packages.every(function (entry) {
        return entry.name !== packageName;
    });
}

async function releaseDiff(dependencies: ReleaseDiffHandlerDependencies): Promise<number> {
    const { packtory, spinnerRenderer, configurationLoader } = dependencies;
    const configuration = await configurationLoader.load();
    if (isUnknownPackage(configuration, dependencies.flags.packageName)) {
        dependencies.log(`Package "${dependencies.flags.packageName}" is not declared in the packtory configuration`);
        return 1;
    }
    const outcome = await packtory.diffAgainstLatestPublished(configuration);
    spinnerRenderer.stopAll();
    const document = buildReleaseDiffDocument({
        report: outcome.getReport(),
        result: outcome.result,
        packages: succeededResultsFrom(outcome.result).filter(function (entry) {
            return dependencies.flags.packageName === undefined || entry.name === dependencies.flags.packageName;
        })
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
