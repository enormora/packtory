import { Result } from 'true-myth';
import { validateConfig as validatePacktoryConfig } from '../../config/validation.ts';
import type { ConfigLoader } from '../config-loader.ts';
import type { TerminalSpinnerRenderer } from '../spinner/terminal-spinner-renderer.ts';
import {
    validateCommandLineInterfacePacktoryConfig,
    type CommandLineInterfacePacktoryConfig,
    type CommandLineInterfacePacktoryConfigResult
} from './release-pull-request-config.ts';
import { getErrorSymbol, getSuccessSymbol } from './runner-symbols.ts';

type Logger = (message: string) => void;

export type ConfigInspectHandlerDependencies = {
    readonly log: Logger;
    readonly spinnerRenderer: TerminalSpinnerRenderer;
    readonly configLoader: ConfigLoader;
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

function formatRootEntries(roots: CommandLineInterfacePacktoryConfig['packages'][number]['roots']): string {
    return (
        Object
            .entries(roots)
            .map(function ([ name, root ]) {
                const declarationFile = root.declarationFile === undefined ? '' : `, d.ts: ${root.declarationFile}`;
                return `${name}: ${root.js}${declarationFile}`;
            })
            .join('; ')
    );
}

function formatPackageSummary(config: CommandLineInterfacePacktoryConfig): readonly string[] {
    const commonSourcesFolder = config.commonPackageSettings?.sourcesFolder;
    return config.packages.map(function (packageConfig) {
        const sourcesFolder = packageConfig.sourcesFolder ?? commonSourcesFolder;
        return (
            [
                `- ${packageConfig.name}`,
                `  sourcesFolder: ${sourcesFolder}`,
                `  roots: ${formatRootEntries(packageConfig.roots)}`,
                `  bundleDependencies: ${formatDependencyList(packageConfig.bundleDependencies)}`,
                `  bundlePeerDependencies: ${formatDependencyList(packageConfig.bundlePeerDependencies)}`
            ]
                .join('\n')
        );
    });
}

function formatSuccess(config: CommandLineInterfacePacktoryConfig): string {
    const packageCount = `${config.packages.length} package(s)`;
    return (
        [
            `${getSuccessSymbol()} Config is valid`,
            `Packages: ${packageCount}`,
            ...formatPackageSummary(config)
        ]
            .join('\n')
    );
}

function validateInspectableConfig(config: unknown): CommandLineInterfacePacktoryConfigResult {
    const cliResult = validateCommandLineInterfacePacktoryConfig(config);
    const packtoryResult = validatePacktoryConfig(config);
    if (cliResult.isErr) {
        return cliResult;
    }
    if (packtoryResult.isErr) {
        return Result.err(packtoryResult.error);
    }

    return cliResult;
}

function reportInspectResult(log: Logger, result: CommandLineInterfacePacktoryConfigResult): number {
    if (result.isErr) {
        log(formatIssueList(result.error));
        return 1;
    }
    log(formatSuccess(result.value));
    return 0;
}

export async function runConfigInspectHandler(dependencies: ConfigInspectHandlerDependencies): Promise<number> {
    const { log, spinnerRenderer, configLoader } = dependencies;
    try {
        const result = validateInspectableConfig(await configLoader.load());
        spinnerRenderer.stopAll();
        return reportInspectResult(log, result);
    } finally {
        spinnerRenderer.stopAll();
    }
}
