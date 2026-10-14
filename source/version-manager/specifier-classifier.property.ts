import assert from 'node:assert';
import fastCheck from 'fast-check';
import { suite, test } from 'mocha';
import { classifySpecifier } from './specifier-classifier.ts';

const packageNameArbitrary = fastCheck.stringMatching(/^[a-z][\da-z-]{0,8}$/u);

const versionArbitrary = fastCheck
    .tuple(
        fastCheck.integer({ min: 0, max: 99 }),
        fastCheck.integer({ min: 0, max: 99 }),
        fastCheck.integer({ min: 0, max: 99 })
    )
    .map(function ([ major, minor, patch ]) {
        return `${major}.${minor}.${patch}`;
    });

const registryNestedSpecifierArbitrary = fastCheck.oneof(
    versionArbitrary,
    versionArbitrary.map(function (version) {
        return `^${version}`;
    }),
    versionArbitrary.map(function (version) {
        return `~${version}`;
    }),
    fastCheck.constantFrom('latest', 'next', 'beta')
);

suite('specifier-classifier', function () {
    test('classify(alias) bucket matches classify(nestedSpecifier) bucket for registry sub-specs', function () {
        fastCheck.assert(
            fastCheck.property(
                packageNameArbitrary,
                packageNameArbitrary,
                registryNestedSpecifierArbitrary,
                function (alias, target, nestedSpecifier) {
                    const aliasResult = classifySpecifier(alias, `npm:${target}@${nestedSpecifier}`);
                    const directResult = classifySpecifier(target, nestedSpecifier);

                    assert.strictEqual(aliasResult.kind, directResult.kind);
                }
            )
        );
    });
});
