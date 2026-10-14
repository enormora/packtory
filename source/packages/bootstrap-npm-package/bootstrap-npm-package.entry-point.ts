#!/usr/bin/env node

import operatingSystem from 'node:os';
import readline from 'node:readline/promises';
import zlib from 'node:zlib';
import { binary, command as createLibraryCommand, positional, run, string } from 'cmd-ts';
import { publish as libnpmpublishPublish } from 'libnpmpublish';
import { getProxyForUrl as getProxyForAddress } from 'proxy-from-env';
import { loginWeb, webAuthOpener as webAuthenticationOpener } from 'npm-profile';
import open from 'open';
import tar from 'tar-stream';
import {
    createBootstrapRunner,
    type BootstrapInput,
    type BootstrapRunner,
    type BootstrapRunnerDependencies
} from '../../bootstrap-npm-package/bootstrap-runner.ts';
import {
    createPackagePublication,
    type WebOneTimePasswordAddresses
} from '../../bootstrap-npm-package/package-publication.ts';
import { createPlaceholderTarballBuilder } from '../../bootstrap-npm-package/placeholder-tarball.ts';
import { createWebLogin } from '../../bootstrap-npm-package/web-login.ts';
import { createClock } from '../../common/clock.ts';
import { withRegistryTransport } from '../../bundle-emitter/registry/registry-transport.ts';

type WebAuthenticationOpenerOptions = {
    readonly registry: string;
};

type WebAuthenticationOpenerResult = {
    readonly token: string;
};

declare module 'npm-profile' {
    // eslint-disable-next-line unicorn/no-exports-in-scripts -- module augmentation must live beside the script import it patches
    export function webAuthOpener(
        opener: (address: string) => Promise<void>,
        authenticationAddress: string,
        doneAddress: string,
        options: WebAuthenticationOpenerOptions
    ): Promise<WebAuthenticationOpenerResult>;
}

const npmRegistryAddress = 'https://registry.npmjs.org/';

async function openInBrowser(loginAddress: string): Promise<void> {
    await open(loginAddress, { wait: false });
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

function isInteractiveTerminal(): boolean {
    return process.stdin.isTTY && process.stdout.isTTY;
}

async function promptForOneTimePasswordViaTerminal(): Promise<string> {
    if (!isInteractiveTerminal()) {
        throw new Error('The npm registry requested a one-time password, but stdin is not an interactive terminal');
    }
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    return requireOneTimePassword(await askOneTimePassword(prompt));
}

async function promptForOneTimePasswordViaBrowser(addresses: WebOneTimePasswordAddresses): Promise<string> {
    process.stdout.write('Opening browser to authorize the publish; complete the prompt in your browser…\n');
    const result = await webAuthenticationOpener(
        openInBrowser,
        addresses.authenticationAddress,
        addresses.doneAddress,
        { registry: npmRegistryAddress }
    );
    return result.token;
}

async function promptForOneTimePassword(addresses: WebOneTimePasswordAddresses | undefined): Promise<string> {
    if (addresses === undefined) {
        return promptForOneTimePasswordViaTerminal();
    }
    return promptForOneTimePasswordViaBrowser(addresses);
}

function createDependencies(): BootstrapRunnerDependencies {
    return {
        placeholderTarballBuilder: createPlaceholderTarballBuilder({
            createGzip: zlib.createGzip,
            createPack: tar.pack
        }),
        webLogin: createWebLogin({ loginWeb, openInBrowser }),
        packagePublication: createPackagePublication({
            async publish(manifest, tarball, options) {
                return withRegistryTransport(
                    { resolveProxy: getProxyForAddress, clock: createClock() },
                    options,
                    async function (requestOptions) {
                        return libnpmpublishPublish(manifest, tarball, requestOptions);
                    }
                );
            }
        }),
        promptForOneTimePassword,
        log(message) {
            process.stdout.write(`${message}\n`);
        }
    };
}

function createComposedRunner(): BootstrapRunner {
    return createBootstrapRunner(createDependencies());
}

type BootstrapCommandInput = {
    readonly packageName: string;
};

async function publishPlaceholder(commandInput: BootstrapCommandInput): Promise<void> {
    const runner = createComposedRunner();
    const input: BootstrapInput = { packageName: commandInput.packageName, hostname: operatingSystem.hostname() };
    await runner.run(input);
}

const bootstrapCommandArguments = {
    packageName: positional({ type: string, displayName: 'package-name' })
};

function createBootstrapCommand(): ReturnType<
    typeof createLibraryCommand<typeof bootstrapCommandArguments, typeof publishPlaceholder>
> {
    return createLibraryCommand({
        name: 'bootstrap-npm-package',
        description: 'Publishes a deprecated placeholder version 0.0.1 of a brand-new npm package so ' +
            'a Trusted Publisher can subsequently be configured for the name.',
        args: bootstrapCommandArguments,
        handler: publishPlaceholder
    });
}

await run(binary(createBootstrapCommand()), process.argv);
