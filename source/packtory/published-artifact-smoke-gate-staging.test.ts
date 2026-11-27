import assert from 'node:assert';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { suite, test } from 'mocha';
import { fake } from 'sinon';
import type { VersionedBundleWithManifest } from '../version-manager/versioned-bundle.ts';
import {
    bundle,
    createContext,
    resource,
    sourceTreeResources,
    type SmokeGateContext,
    verify
} from '../test-libraries/published-artifact-smoke-gate-fixtures.ts';

type PausedStaging = {
    readonly context: SmokeGateContext;
    readonly started: Promise<undefined>;
    readonly release: () => void;
};

function pauseArtifactWrites(failure: Error | undefined): PausedStaging {
    const release = Promise.withResolvers<undefined>();
    const started = Promise.withResolvers<undefined>();
    const progress = { writes: 0, pending: 0 };
    const context = createContext({
        fileManager: {
            checkReadability: fake.resolves({ isReadable: true }),
            setExecutable: fake.resolves(undefined),
            writeFile: fake(async function () {
                progress.writes += 1;
                progress.pending += 1;
                started.resolve(undefined);
                if (failure !== undefined && progress.writes === 1) {
                    progress.pending -= 1;
                    throw failure;
                }
                try {
                    await release.promise;
                } finally {
                    progress.pending -= 1;
                }
            })
        },
        runImportProbe: fake(async function () {
            assert.strictEqual(progress.pending, 0);
        })
    });
    return {
        context,
        started: started.promise,
        release() {
            release.resolve(undefined);
        }
    };
}

function stagingBundle(): VersionedBundleWithManifest {
    return bundle({ contents: [ resource('index.js'), ...sourceTreeResources(64) ] });
}

suite('published artifact smoke staging', function () {
    test('overlaps independent writes within a bounded window before probing exports', async function () {
        const staging = pauseArtifactWrites(undefined);
        const verification = verify(staging.context.gate, stagingBundle());
        await staging.started;
        try {
            await nextTurn();
            assert.deepStrictEqual(
                [ staging.context.writeFile.callCount, staging.context.removeFolder.callCount ],
                [ 16, 0 ]
            );
        } finally {
            staging.release();
            await verification;
        }
        assert.deepStrictEqual(
            [ staging.context.writeFile.callCount, staging.context.removeFolder.callCount ],
            [ 66, 1 ]
        );
    });

    test('waits for pending writes before cleanup and preserves the write failure', async function () {
        const failure = new Error('Cannot write artifact');
        const staging = pauseArtifactWrites(failure);
        const rejected = assert.rejects(verify(staging.context.gate, stagingBundle()), function (error: unknown) {
            return error === failure;
        });
        await staging.started;
        try {
            await nextTurn();
            assert.deepStrictEqual(
                [ staging.context.removeFolder.callCount, staging.context.runImportProbe.callCount ],
                [ 0, 0 ]
            );
        } finally {
            staging.release();
            await rejected;
        }
        assert.strictEqual(staging.context.removeFolder.callCount, 1);
    });
});
