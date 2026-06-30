#!/usr/bin/env node

import os from 'node:os';
import readline from 'node:readline/promises';
import zlib from 'node:zlib';
import { binary, command, positional, run, string } from 'cmd-ts';
import { publish as libnpmpublishPublish } from 'libnpmpublish';
import { loginWeb, webAuthOpener } from 'npm-profile';
import open from 'open';
import tar from 'tar-stream';
import {
    createBootstrapRunner,
    type BootstrapInput,
    type BootstrapRunner,
    type BootstrapRunnerDependencies
} from '../../bootstrap-npm-package/bootstrap-runner.ts';
import { createPackagePublication, type WebOtpUrls } from '../../bootstrap-npm-package/package-publication.ts';
import { createPlaceholderTarballBuilder } from '../../bootstrap-npm-package/placeholder-tarball.ts';
import { createWebLogin } from '../../bootstrap-npm-package/web-login.ts';

type WebAuthOpenerOptions = {
    readonly registry: string;
};

type WebAuthOpenerResult = {
    readonly token: string;
};

declare module 'npm-profile' {
    // eslint-disable-next-line unicorn/no-exports-in-scripts -- module augmentation must live beside the script import it patches
    export function webAuthOpener(
        opener: (url: string) => Promise<void>,
        authUrl: string,
        doneUrl: string,
        opts: WebAuthOpenerOptions
    ): Promise<WebAuthOpenerResult>;
}

const npmRegistryUrl = 'https://registry.npmjs.org/';

async function openInBrowser(loginUrl: string): Promise<void> {
    await open(loginUrl, { wait: false });
}

function requireOneTimePassword(answer: string): string {
    const trimmed = answer.trim();
    if (trimmed.length === 0) {
        throw new Error('One-time password input was empty');
    }
    return trimmed;
}

async function askOneTimePassword(prompt: readline.Interface): Promise<string> {
    try {
        return await prompt.question('Registry one-time password: ');
    } finally {
        prompt.close();
    }
}

async function promptForOneTimePasswordViaTerminal(): Promise<string> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error('The npm registry requested a one-time password, but stdin is not an interactive terminal');
    }
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    return requireOneTimePassword(await askOneTimePassword(prompt));
}

async function promptForOneTimePasswordViaBrowser(urls: WebOtpUrls): Promise<string> {
    process.stdout.write('Opening browser to authorize the publish; complete the prompt in your browser…\n');
    const result = await webAuthOpener(openInBrowser, urls.authUrl, urls.doneUrl, { registry: npmRegistryUrl });
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
        placeholderTarballBuilder: createPlaceholderTarballBuilder({
            createGzip: zlib.createGzip,
            createPack: tar.pack
        }),
        webLogin: createWebLogin({ loginWeb, openInBrowser }),
        packagePublication: createPackagePublication({ publish: libnpmpublishPublish }),
        promptForOneTimePassword,
        log(message) {
            process.stdout.write(`${message}\n`);
        }
    };
}

function createComposedRunner(): BootstrapRunner {
    return createBootstrapRunner(createDependencies());
}

const bootstrapCommand = command({
    name: 'bootstrap-npm-package',
    description: 'Publishes a deprecated placeholder version 0.0.1 of a brand-new npm package so ' +
        'a Trusted Publisher can subsequently be configured for the name.',
    args: {
        packageName: positional({ type: string, displayName: 'package-name' })
    },
    async handler(args) {
        const runner = createComposedRunner();
        const input: BootstrapInput = { packageName: args.packageName, hostname: os.hostname() };
        await runner.run(input);
    }
});

await run(binary(bootstrapCommand), process.argv);
