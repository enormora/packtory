import test from 'node:test';
import assert from 'node:assert';
import {increaseVersion, replaceBundleVersion} from './version.js';
import {BundleDescription} from '../bundler/bundle-description.js';

test('increaseVersion() throws when the given version is invalid', () => {
    try {
        increaseVersion('not.a.valid.version.string');
        assert.fail('Expected increaseVersion() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Unable to increase version number not.a.valid.version.string');
    }
})

test('increaseVersion() throws when the given mimimum version is invalid', () => {
    try {
        increaseVersion('1.2.3', '-1.-1.-1');
        assert.fail('Expected increaseVersion() to fail but it did not');
    } catch (error: unknown) {
        assert.strictEqual((error as Error).message, 'Invalid minimumVersion -1.-1.-1 provided');
    }
})

test('increaseVersion() returns the increased number when no mimimum version is given', () => {
    const result = increaseVersion('1.2.3');
    assert.strictEqual(result, '1.2.4');
})

test('increaseVersion() returns the mimimum version when it is greater than the increased version', () => {
    const result = increaseVersion('1.2.3', '1.2.5');
    assert.strictEqual(result, '1.2.5');
})

test('increaseVersion() returns the the increase version when mimimum version is given but it is smaller', () => {
    const result = increaseVersion('1.2.3', '1.2.2');
    assert.strictEqual(result, '1.2.4');
})

test('replaceBundleVersion() returns a new bundle with package.json content when given a bundle with empty contents but with an updated version number', () => {
    const inputBundle: BundleDescription = {
        contents: [],
        packageJson: {name: 'the-name', version: 'input-version'}
    };
    const newBundle = replaceBundleVersion(inputBundle, 'new-version');

    assert.deepStrictEqual(newBundle, {
        contents: [ {kind: 'source', targetFilePath: 'package.json', source: '{\n    "name": "the-name",\n    "version": "new-version"\n}'} ],
        packageJson: {name: 'the-name', version: 'new-version'}
    });
});

test('replaceBundleVersion() returns a new bundle with package.json content when given a bundle with with package.json and updates version number', () => {
    const inputBundle: BundleDescription = {
        contents: [ {kind: 'source', targetFilePath: 'package.json', source: 'old-package-json-content'} ],
        packageJson: {name: 'the-name', version: 'input-version'}
    };
    const newBundle = replaceBundleVersion(inputBundle, 'new-version');

    assert.deepStrictEqual(newBundle, {
        contents: [ {kind: 'source', targetFilePath: 'package.json', source: '{\n    "name": "the-name",\n    "version": "new-version"\n}'} ],
        packageJson: {name: 'the-name', version: 'new-version'}
    });
});

test('replaceBundleVersion() returns a new bundle with the updated package.json content and keeps all other files', () => {
    const inputBundle: BundleDescription = {
        contents: [
            {kind: 'source', targetFilePath: 'package.json', source: 'old-package-json-content'},
            {kind: 'source', targetFilePath: 'not-package.json', source: 'other-content'},
        ],
        packageJson: {name: 'the-name', version: 'input-version'}
    };
    const newBundle = replaceBundleVersion(inputBundle, 'new-version');

    assert.deepStrictEqual(newBundle, {
        contents: [
            {kind: 'source', targetFilePath: 'package.json', source: '{\n    "name": "the-name",\n    "version": "new-version"\n}'},
            {kind: 'source', targetFilePath: 'not-package.json', source: 'other-content'},
        ],
        packageJson: {name: 'the-name', version: 'new-version'}
    });
});
