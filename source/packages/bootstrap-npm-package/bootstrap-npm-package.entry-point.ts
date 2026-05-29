#!/usr/bin/env node

import readline from 'node:readline/promises';
import zlib from 'node:zlib';
import { binary, command, option, positional, run, string } from 'cmd-ts';
import { publish as libnpmpublishPublish } from 'libnpmpublish';
import { webAuthOpener } from 'npm-profile';
import open from 'open';
import {
    createBootstrapRunner,
    type BootstrapInput,
    type BootstrapRunner,
    type BootstrapRunnerDependencies
} from '../../bootstrap-npm-package/bootstrap-runner.ts';
import { createPackagePublication, type WebOtpUrls } from '../../bootstrap-npm-package/package-publication.ts';
import { createPlaceholderTarballBuilder } from '../../bootstrap-npm-package/placeholder-tarball.ts';

declare module 'npm-profile' {
    export function webAuthOpener(
        opener: (url: string) => Promise<void>,
        authUrl: string,
        doneUrl: string,
        opts: { readonly registry: string }
    ): Promise<{ readonly token: string }>;
}

const defaultRegistryUrl = 'https://registry.npmjs.org/';
const defaultWorkaroundUrl = 'https://github.com/npm/cli/issues/8544';
const defaultDistTag = 'bootstrap';

async function openInBrowser(loginUrl: string): Promise<void> {
    await open(loginUrl, { wait: false });
}

async function promptForOneTimePasswordViaTerminal(): Promise<string> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('The npm registry requested a one-time password, but stdin is not an interactive terminal');
    }
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await prompt.question('Registry one-time password: ');
        const trimmed = answer.trim();
        if (trimmed.length === 0) {
            throw new Error('One-time password input was empty');
        }
        return trimmed;
    } finally {
        prompt.close();
    }
}

async function promptForOneTimePasswordViaBrowser(urls: WebOtpUrls): Promise<string> {
    process.stdout.write('Opening browser to authorize the publish; complete the prompt in your browser…\n');
    const result = await webAuthOpener(openInBrowser, urls.authUrl, urls.doneUrl, { registry: defaultRegistryUrl });
    return result.token;
}

async function promptForOneTimePassword(urls: WebOtpUrls | undefined): Promise<string> {
    if (urls === undefined) {
        return promptForOneTimePasswordViaTerminal();
    }
    return promptForOneTimePasswordViaBrowser(urls);
}

function createDependencies(): BootstrapRunnerDependencies {
    return {
        placeholderTarballBuilder: createPlaceholderTarballBuilder({ createGzip: zlib.createGzip }),
        packagePublication: createPackagePublication({ publish: libnpmpublishPublish }),
        promptForOneTimePassword,
        log: (message) => {
            process.stdout.write(`${message}\n`);
        }
    };
}

function createComposedRunner(): BootstrapRunner {
    return createBootstrapRunner(createDependencies());
}

const bootstrapCommand = command({
    name: 'bootstrap-npm-package',
    description:
        'Publishes a deprecated placeholder version 0.0.1 of a brand-new npm package so ' +
        'a Trusted Publisher can subsequently be configured for the name.',
    args: {
        packageName: positional({ type: string, displayName: 'package-name' }),
        registryUrl: option({
            long: 'registry-url',
            type: string,
            defaultValue: () => {
                return defaultRegistryUrl;
            }
        }),
        workaroundUrl: option({
            long: 'workaround-url',
            type: string,
            defaultValue: () => {
                return defaultWorkaroundUrl;
            }
        }),
        distTag: option({
            long: 'dist-tag',
            type: string,
            defaultValue: () => {
                return defaultDistTag;
            }
        })
    },
    async handler(args) {
        const runner = createComposedRunner();
        const input: BootstrapInput = {
            packageName: args.packageName,
            registryUrl: args.registryUrl,
            workaroundUrl: args.workaroundUrl,
            distTag: args.distTag
        };
        await runner.run(input);
    }
});

await run(binary(bootstrapCommand), process.argv);
