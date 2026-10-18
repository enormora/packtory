import { fake } from 'sinon';
import type { ConfigurationLoader } from '../command-line-interface/configuration-loader.ts';
import type { TerminalSpinnerRenderer } from '../command-line-interface/spinner/terminal-spinner-renderer.ts';

export function createSpinnerRendererStub(): TerminalSpinnerRenderer {
    return { stopAll: fake() } as unknown as TerminalSpinnerRenderer;
}

export function createConfigurationLoaderStub(): ConfigurationLoader {
    return { load: fake.resolves({}) };
}
