import { Result } from 'true-myth';
import { validateConfiguration as validatePacktoryConfiguration } from '../../configuration/validation.ts';
import type { ConfigurationLoader } from '../configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import {
    validateCommandLineInterfacePacktoryConfiguration,
    type CommandLineInterfacePacktoryConfiguration,
    type CommandLineInterfacePacktoryConfigurationResult
} from './release-pull-request-configuration.ts';
import { getErrorSymbol, getSuccessSymbol } from './runner-symbols.ts';

type Logger = (message: string) => void;

export type ConfigurationInspectHandlerDependencies = {
    readonly log: Logger;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configurationLoader: ConfigurationLoader;
};

function formatIssueList(issues: readonly string[]): string {
    return (
        [
            `${getErrorSymbol()} The provided config is invalid, there are ${issues.length} issue(s)`,
            '',
            `- ${issues.join('\n- ')}`
        ]
            .join('\n')
    );
}

function formatDependencyList(dependencies: readonly string[] | undefined): string {
    return dependencies === undefined || dependencies.length === 0
        ? 'none'
        : dependencies.join(', ');
}

function formatRootEntries(roots: CommandLineInterfacePacktoryConfiguration['packages'][number]['roots']): string {
    return (
        Object
            .entries(roots)
            .map(function ([ name, root ]) {
                const declarationFile = root.declarationFile === undefined ? '' : `, d.ts: ${root.declarationFile}`;
                return `${name}: ${root.javaScript}${declarationFile}`;
            })
            .join('; ')
    );
}

function formatPackageSummary(configuration: CommandLineInterfacePacktoryConfiguration): readonly string[] {
    const commonSourcesFolder = configuration.commonPackageSettings?.sourcesFolder;
    return configuration.packages.map(function (packageConfiguration) {
        const sourcesFolder = packageConfiguration.sourcesFolder ?? commonSourcesFolder;
        return (
            [
                `- ${packageConfiguration.name}`,
                `  sourcesFolder: ${sourcesFolder}`,
                `  roots: ${formatRootEntries(packageConfiguration.roots)}`,
                `  bundleDependencies: ${formatDependencyList(packageConfiguration.bundleDependencies)}`,
                `  bundlePeerDependencies: ${formatDependencyList(packageConfiguration.bundlePeerDependencies)}`
            ]
                .join('\n')
        );
    });
}

function formatSuccess(configuration: CommandLineInterfacePacktoryConfiguration): string {
    const packageCount = `${configuration.packages.length} package(s)`;
    return (
        [
            `${getSuccessSymbol()} Config is valid`,
            `Packages: ${packageCount}`,
            ...formatPackageSummary(configuration)
        ]
            .join('\n')
    );
}

function validateInspectableConfiguration(configuration: unknown): CommandLineInterfacePacktoryConfigurationResult {
    const commandLineInterfaceResult = validateCommandLineInterfacePacktoryConfiguration(configuration);
    const packtoryResult = validatePacktoryConfiguration(configuration);
    if (commandLineInterfaceResult.isErr) {
        return commandLineInterfaceResult;
    }
    if (packtoryResult.isErr) {
        return Result.err(packtoryResult.error);
    }

    return commandLineInterfaceResult;
}

function reportInspectResult(log: Logger, result: CommandLineInterfacePacktoryConfigurationResult): number {
    if (result.isErr) {
        log(formatIssueList(result.error));
        return 1;
    }
    log(formatSuccess(result.value));
    return 0;
}

export async function runConfigurationInspectHandler(
    dependencies: ConfigurationInspectHandlerDependencies
): Promise<number> {
    const { log, spinnerRenderer, configurationLoader } = dependencies;
    try {
        const result = validateInspectableConfiguration(await configurationLoader.load());
        spinnerRenderer.stopAll();
        return reportInspectResult(log, result);
    } finally {
        spinnerRenderer.stopAll();
    }
}
