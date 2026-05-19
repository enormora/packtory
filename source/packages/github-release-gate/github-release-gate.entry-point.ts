#!/usr/bin/env node

import fs from 'node:fs';
import { createConfigLoader } from '../../command-line-interface/config-loader.ts';
import { createFileManager } from '../../file-manager/file-manager.ts';
import type * as packtoryEntryPoint from '../packtory/packtory.entry-point.ts';
import {
    runGitHubReleaseGate,
    type GitHubReleaseGateRunnerDependencies
} from '../../github-release-gate/cli-runner.ts';

function getEnvironmentVariable(variableName: string): string | undefined {
    const value = process.env[variableName];
    return value === undefined || value.length === 0 ? undefined : value;
}

function createDependencies(): GitHubReleaseGateRunnerDependencies {
    const configLoader = createConfigLoader({
        currentWorkingDirectory: process.cwd(),
        async importModule(modulePath) {
            const importedModule: unknown = await import(modulePath);
            return importedModule;
        }
    });

    return {
        analyzeReleaseAgainstLatestPublished: async (config) => {
            const packtory: typeof packtoryEntryPoint = await import('../packtory/packtory.entry-point.ts');
            return packtory.analyzeReleaseAgainstLatestPublished(config);
        },
        fetch: globalThis.fetch,
        fileManager: createFileManager({ hostFileSystem: fs.promises }),
        getEnvironmentVariable,
        loadPacktoryConfig: async () => {
            return await configLoader.load();
        },
        now: () => {
            return new Date();
        },
        stdoutWrite: (message) => {
            process.stdout.write(`${message}\n`);
        }
    };
}

process.exitCode = await (async () => {
    try {
        await runGitHubReleaseGate(createDependencies());

        return 0;
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    }
})();
