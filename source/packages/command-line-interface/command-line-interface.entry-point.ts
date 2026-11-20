#!/usr/bin/env node

import type {
    CommandLineInterfacePacktoryConfiguration
} from '../../command-line-interface/runner/release-pull-request-configuration.ts';
import { runCommandLineInterface, failCommandLineInterface } from './command-line-interface.composition.ts';

runCommandLineInterface().catch(failCommandLineInterface);

// eslint-disable-next-line unicorn/no-exports-in-scripts -- public CLI package types are re-exported from this entry point
export type PacktoryConfiguration = CommandLineInterfacePacktoryConfiguration;
