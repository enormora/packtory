#!/usr/bin/env node

import type {
    CommandLineInterfacePacktoryConfiguration
} from '../../command-line-interface/runner/release-pull-request-configuration.ts';
import { createCommandLineInterface } from './command-line-interface.composition.ts';

async function importModule(modulePath: string): Promise<unknown> {
    return import(modulePath);
}

const commandLineInterface = createCommandLineInterface(importModule);
try {
    await commandLineInterface.run();
} catch (error: unknown) {
    await commandLineInterface.fail(error);
}

// eslint-disable-next-line unicorn/no-exports-in-scripts -- public CLI package types are re-exported from this entry point
export type PacktoryConfiguration = CommandLineInterfacePacktoryConfiguration;
