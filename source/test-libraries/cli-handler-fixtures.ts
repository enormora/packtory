/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- test fixtures only stub the methods exercised by the CLI handler tests */
import { fake } from 'sinon';
import type { Packtory } from '../packtory/packtory.ts';
import type { ConfigLoader } from '../command-line-interface/config-loader.ts';
import type { TerminalSpinnerRenderer } from '../command-line-interface/spinner/terminal-spinner-renderer.ts';

type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;

export function spinnerRendererStub(): TerminalSpinnerRenderer {
    return { stopAll: fake() } as unknown as TerminalSpinnerRenderer;
}

export function configLoaderStub(): ConfigLoader {
    return { load: fake.resolves({}) } as unknown as ConfigLoader;
}

export function packtoryStub(outcome: BuildOutcome): Packtory {
    return { buildAndPublishAll: fake.resolves(outcome) } as unknown as Packtory;
}

export function buildOutcome(overrides: Partial<BuildOutcome> = {}): BuildOutcome {
    return {
        getReport: () => undefined,
        result: { isOk: true, isErr: false, value: [] },
        ...overrides
    } as unknown as BuildOutcome;
}
