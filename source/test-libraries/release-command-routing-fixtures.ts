import assert from 'node:assert';
import { fake } from 'sinon';
import { Result } from 'true-myth';
import type { BuildReport } from '../packtory/packtory.ts';
import { createBuildReportFixture } from './preview-fixtures.ts';
import {
    createRunner
} from './runner-test-support.ts';

export type ForwardedVendorDependencies = {
    readonly vendorDependencies: boolean;
};

export type ForwardedPackFormat = {
    readonly format: string;
};

export type RunnerReleasePlanOutcome = {
    readonly result: unknown;
    readonly getReport: () => BuildReport;
};

export function releasePlanOutcome(packages: readonly unknown[]): RunnerReleasePlanOutcome {
    return {
        result: Result.ok({ packages }),
        getReport() {
            return createBuildReportFixture();
        }
    };
}

export async function expectCommandPlansRelease(command: 'changelog' | 'release'): Promise<void> {
    const loadConfiguration = fake.resolves('the-config');
    const planReleaseAgainstLatestPublished = fake.resolves(releasePlanOutcome([]));
    const runner = createRunner({ loadConfiguration, planReleaseAgainstLatestPublished });

    const exitCode = await runner.run([ 'foo', 'bar', command ]);

    assert.strictEqual(exitCode, 0);
    assert.strictEqual(loadConfiguration.callCount, 1);
    assert.strictEqual(planReleaseAgainstLatestPublished.callCount, 1);
    assert.strictEqual(planReleaseAgainstLatestPublished.firstCall.args[0], 'the-config');
}

export function packAllArguments(format: 'folder' | 'zip', outputPath: string): readonly string[] {
    return [ 'foo', 'bar', 'pack', '--all', '--format', format, '--out', outputPath ];
}

export function packAllFolderArguments(): readonly string[] {
    return packAllArguments('folder', '/workspace/packages');
}
