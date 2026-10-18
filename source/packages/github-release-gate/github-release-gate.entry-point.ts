#!/usr/bin/env node

import fileSystem from 'node:fs';
import path from 'node:path';
import { createFileManager } from '../../file-manager/file-manager.ts';
import type * as packtoryEntryPoint from '../packtory/packtory.entry-point.ts';
import {
    runGitHubReleaseGate,
    type GitHubReleaseGateRunnerDependencies
} from '../../github-release-gate/command-line-interface-runner.ts';

type UnknownFunction = (...inputArguments: readonly unknown[]) => unknown;

type ConfigurationModule = Readonly<Record<PropertyKey, unknown>>;

function isFunction(value: unknown): value is UnknownFunction {
    return typeof value === 'function';
}

function isConfigurationModule(value: unknown): value is ConfigurationModule {
    return value !== null && typeof value === 'object';
}

function unwrapConfigurationModule(module: ConfigurationModule): unknown {
    if (Object.hasOwn(module, 'configuration')) {
        return module.configuration;
    }

    if (Object.hasOwn(module, 'buildConfiguration')) {
        const { buildConfiguration } = module;
        if (isFunction(buildConfiguration)) {
            return buildConfiguration();
        }

        throw new Error('Named export of "buildConfiguration" config file is not a function');
    }

    throw new Error('Config file doesn’t have a named export "configuration" nor "buildConfiguration"');
}

function getEnvironmentVariable(variableName: string): string | undefined {
    const value = process.env[variableName];
    return value === undefined || value.length === 0 ? undefined : value;
}

async function loadPacktoryConfigurationFromCwd(): Promise<unknown> {
    const configurationFilePath = path.join(process.cwd(), 'packtory.config.js');
    const module: unknown = await import(configurationFilePath);

    if (!isConfigurationModule(module)) {
        throw new Error('Invalid config file');
    }

    return unwrapConfigurationModule(module);
}

function createDependencies(): GitHubReleaseGateRunnerDependencies {
    return {
        async analyzeReleaseAgainstLatestPublished(configuration) {
            const packtory: typeof packtoryEntryPoint = await import('../packtory/packtory.entry-point.ts');
            return packtory.analyzeReleaseAgainstLatestPublished(configuration);
        },
        fetch,
        fileManager: createFileManager({ hostFileSystem: fileSystem.promises }),
        getEnvironmentVariable,
        loadPacktoryConfiguration: loadPacktoryConfigurationFromCwd,
        now() {
            return new Date();
        },
        standardOutputWrite(message) {
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
