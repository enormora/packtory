import assert from 'node:assert';
import fc from 'fast-check';
import { suite, test } from 'mocha';
import { classifySpecifier } from './specifier-classifier.ts';

const packageNameArbitrary = fc.stringMatching(/^[a-z][\da-z-]{0,8}$/u);

const versionArbitrary = fc
    .tuple(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 99 }))
    .map(([major, minor, patch]) => {
        return `${major}.${minor}.${patch}`;
    });

const registrySubSpecArbitrary = fc.oneof(
    versionArbitrary,
    versionArbitrary.map((version) => {
        return `^${version}`;
    }),
    versionArbitrary.map((version) => {
        return `~${version}`;
    }),
    fc.constantFrom('latest', 'next', 'beta')
);

suite('specifier-classifier', function () {
    test('classify(alias) bucket matches classify(subSpec) bucket for registry sub-specs', function () {
        fc.assert(
            fc.property(
                packageNameArbitrary,
                packageNameArbitrary,
                registrySubSpecArbitrary,
                (alias, target, subSpec) => {
                    const aliasResult = classifySpecifier(alias, `npm:${target}@${subSpec}`);
                    const directResult = classifySpecifier(target, subSpec);

                    assert.strictEqual(aliasResult.kind, directResult.kind);
                }
            )
        );
    });
});
