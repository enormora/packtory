/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- shared stubs cast partial mocks of handler dependencies */
import { fake } from 'sinon';
import type { ConfigLoader } from '../command-line-interface/config-loader.ts';
import type { TerminalSpinnerRenderer } from '../command-line-interface/spinner/terminal-spinner-renderer.ts';

export function createSpinnerRendererStub(): TerminalSpinnerRenderer {
    return { stopAll: fake() } as unknown as TerminalSpinnerRenderer;
}

export function createConfigLoaderStub(): ConfigLoader {
    return { load: fake.resolves({}) } as unknown as ConfigLoader;
}
