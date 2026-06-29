import { fake } from 'sinon';
import type { ConfigLoader } from '../command-line-interface/config-loader.ts';
import type { TerminalSpinnerRenderer } from '../command-line-interface/spinner/terminal-spinner-renderer.ts';

export function createSpinnerRendererStub(): TerminalSpinnerRenderer {
    return { stopAll: fake() } as unknown as TerminalSpinnerRenderer;
}

export function createConfigLoaderStub(): ConfigLoader {
    return { load: fake.resolves({}) };
}
