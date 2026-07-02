#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { loadConfigModule } from '../../config/config-module-loader.ts';
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

async function loadPacktoryConfigFromCwd(): Promise<unknown> {
    const configFilePath = path.join(process.cwd(), 'packtory.config.js');
    return loadConfigModule(configFilePath, async function (modulePath) {
        return import(modulePath);
    });
}

function createDependencies(): GitHubReleaseGateRunnerDependencies {
    return {
        async analyzeReleaseAgainstLatestPublished(config) {
            const packtory: typeof packtoryEntryPoint = await import('../packtory/packtory.entry-point.ts');
            return packtory.analyzeReleaseAgainstLatestPublished(config);
        },
        fetch,
        fileManager: createFileManager({ hostFileSystem: fs.promises }),
        getEnvironmentVariable,
        loadPacktoryConfig: loadPacktoryConfigFromCwd,
        now() {
            return new Date();
        },
        stdoutWrite(message) {
            process.stdout.write(`${message}\n`);
        }
    };
}

process.exitCode = await (async function () {
    try {
        await runGitHubReleaseGate(createDependencies());

        return 0;
    } catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        return 1;
    }
})();
