import type { ChecksSettings } from '../config/config.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';

export type CheckContext = {
    readonly bundles: readonly LinkedBundle[];
};

export type CheckRule = {
    readonly isEnabled: (settings: ChecksSettings | undefined) => boolean;
    readonly run: (context: CheckContext, settings: ChecksSettings | undefined) => readonly string[];
};
