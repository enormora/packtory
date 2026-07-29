import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { Packtory } from '../packtory/packtory.ts';
import type { ConfigLoader } from '../command-line-interface/config-loader.ts';
import type { TerminalSpinnerRenderer } from '../command-line-interface/spinner/terminal-spinner-renderer.ts';
import { createFakeFileManager, type FakeFileManager } from './fake-file-manager.ts';

type BuildOutcome = Awaited<ReturnType<Packtory['buildAndPublishAll']>>;

export function spinnerRendererStub(): TerminalSpinnerRenderer {
    return { stopAll: fake() } as unknown as TerminalSpinnerRenderer;
}

export function configLoaderStub(): ConfigLoader {
    return { load: fake.resolves({}) };
}

export function fileManagerStub(): FakeFileManager {
    return createFakeFileManager();
}

export function packtoryStub(outcome: BuildOutcome): Packtory {
    return { buildAndPublishAll: fake.resolves(outcome) } as unknown as Packtory;
}

export function buildOutcome(overrides: Partial<BuildOutcome> = {}): BuildOutcome {
    return {
        getReport() {
            return undefined;
        },
        result: Result.ok([]),
        ...overrides
    };
}
