#!/usr/bin/env node

import os from 'node:os';
import zlib from 'node:zlib';
import { binary, command, option, positional, run, string } from 'cmd-ts';
import { publish as libnpmpublishPublish } from 'libnpmpublish';
import npmFetch from 'npm-registry-fetch';
import { loginWeb } from 'npm-profile';
import open from 'open';
import {
    createBootstrapRunner,
    type BootstrapInput,
    type BootstrapRunner,
    type BootstrapRunnerDependencies
} from '../../bootstrap-npm-package/bootstrap-runner.ts';
import { createPackagePublication } from '../../bootstrap-npm-package/package-publication.ts';
import { createPlaceholderTarballBuilder } from '../../bootstrap-npm-package/placeholder-tarball.ts';
import { createVersionDeprecation } from '../../bootstrap-npm-package/version-deprecation.ts';
import { createWebLogin } from '../../bootstrap-npm-package/web-login.ts';

const defaultRegistryUrl = 'https://registry.npmjs.org/';
const defaultWorkaroundUrl = 'https://github.com/npm/cli/issues/8544';
const defaultDistTag = 'bootstrap';

async function openInBrowser(loginUrl: string): Promise<void> {
    await open(loginUrl, { wait: false });
}

function createDependencies(): BootstrapRunnerDependencies {
    return {
        placeholderTarballBuilder: createPlaceholderTarballBuilder({ createGzip: zlib.createGzip }),
        webLogin: createWebLogin({ loginWeb, openInBrowser }),
        packagePublication: createPackagePublication({ publish: libnpmpublishPublish }),
        versionDeprecation: createVersionDeprecation({ fetchJson: npmFetch.json, registryFetch: npmFetch }),
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
            distTag: args.distTag,
            hostname: os.hostname()
        };
        await runner.run(input);
    }
});

await run(binary(bootstrapCommand), process.argv);
