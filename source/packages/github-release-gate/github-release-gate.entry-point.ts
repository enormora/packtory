#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { hasProp, isPlainObject } from 'remeda';
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

function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === 'function';
}

function unwrapConfigModule(module: Readonly<Record<PropertyKey, unknown>>): unknown {
    if (hasProp(module, 'config')) {
        return module.config;
    }

    if (hasProp(module, 'buildConfig')) {
        const { buildConfig } = module;
        if (isFunction(buildConfig)) {
            return buildConfig();
        }

        throw new Error('Named export of "buildConfig" config file is not a function');
    }

    throw new Error('Config file doesn’t have a named export "config" nor "buildConfig"');
}

async function loadPacktoryConfigFromCwd(): Promise<unknown> {
    const configFilePath = path.join(process.cwd(), 'packtory.config.js');
    const module: unknown = await import(configFilePath);

    if (!isPlainObject(module)) {
        throw new Error('Invalid config file');
    }

    return unwrapConfigModule(module);
}

function createDependencies(): GitHubReleaseGateRunnerDependencies {
    return {
        analyzeReleaseAgainstLatestPublished: async (config) => {
            const packtory: typeof packtoryEntryPoint = await import('../packtory/packtory.entry-point.ts');
            return packtory.analyzeReleaseAgainstLatestPublished(config);
        },
        fetch: globalThis.fetch,
        fileManager: createFileManager({ hostFileSystem: fs.promises }),
        getEnvironmentVariable,
        loadPacktoryConfig: loadPacktoryConfigFromCwd,
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
