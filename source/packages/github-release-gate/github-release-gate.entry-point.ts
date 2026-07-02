#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createFileManager } from '../../file-manager/file-manager.ts';
import type * as packtoryEntryPoint from '../packtory/packtory.entry-point.ts';
import {
    runGitHubReleaseGate,
    type GitHubReleaseGateRunnerDependencies
} from '../../github-release-gate/cli-runner.ts';

type UnknownFunction = (...args: readonly unknown[]) => unknown;

type ConfigModule = Readonly<Record<PropertyKey, unknown>>;

function isFunction(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}

function isConfigModule(value: unknown): value is ConfigModule {
    return value !== null && typeof value === 'object';
}

function unwrapConfigModule(module: ConfigModule): unknown {
    if (Object.hasOwn(module, 'config')) {
        return module.config;
    }

    if (Object.hasOwn(module, 'buildConfig')) {
        const { buildConfig } = module;
        if (isFunction(buildConfig)) {
            return buildConfig();
        }

        throw new Error('Named export of "buildConfig" config file is not a function');
    }

    throw new Error('Config file doesn’t have a named export "config" nor "buildConfig"');
}

function getEnvironmentVariable(variableName: string): string | undefined {
    const value = process.env[variableName];
    return value === undefined || value.length === 0 ? undefined : value;
}

async function loadPacktoryConfigFromCwd(): Promise<unknown> {
    const configFilePath = path.join(process.cwd(), 'packtory.config.js');
    const module: unknown = await import(configFilePath);

    if (!isConfigModule(module)) {
        throw new Error('Invalid config file');
    }

    return unwrapConfigModule(module);
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
