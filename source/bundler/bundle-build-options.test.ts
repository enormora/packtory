import test from 'ava';
import { validateBundleBuildOptions, BundleBuildOptions } from './bundle-build-options.js';

test('throws when a bundle is listed in both dependencies and peerDependencies', (t) => {
    const options: BundleBuildOptions = {
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        name: 'the-package',
        version: 'the-version',
        mainPackageJson: {},
        dependencies: [{ contents: [], packageJson: { name: 'foo', version: '42' } }],
        peerDependencies: [{ contents: [], packageJson: { name: 'foo', version: '42' } }],
    };

    try {
        validateBundleBuildOptions(options);
        t.fail('Expected validateBundleBuildOptions() to throw but it did not');
    } catch (error: unknown) {
        t.is(
            (error as Error).message,
            'The following packages are listed more than once in dependencies or peerDependencies: foo',
        );
    }
});

test('throws when multiple bundles are listed multiple times', (t) => {
    const options: BundleBuildOptions = {
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        name: 'the-package',
        version: 'the-version',
        mainPackageJson: {},
        dependencies: [
            { contents: [], packageJson: { name: 'foo', version: '42' } },
            { contents: [], packageJson: { name: 'bar', version: '42' } },
        ],
        peerDependencies: [
            { contents: [], packageJson: { name: 'foo', version: '42' } },
            { contents: [], packageJson: { name: 'bar', version: '42' } },
        ],
    };

    try {
        validateBundleBuildOptions(options);
        t.fail('Expected validateBundleBuildOptions() to throw but it did not');
    } catch (error: unknown) {
        t.is(
            (error as Error).message,
            'The following packages are listed more than once in dependencies or peerDependencies: foo, bar',
        );
    }
});

test('throws when a bundle is listed twice in dependencies', (t) => {
    const options: BundleBuildOptions = {
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        name: 'the-package',
        version: 'the-version',
        mainPackageJson: {},
        dependencies: [
            { contents: [], packageJson: { name: 'foo', version: '42' } },
            { contents: [], packageJson: { name: 'foo', version: '42' } },
        ],
    };

    try {
        validateBundleBuildOptions(options);
        t.fail('Expected validateBundleBuildOptions() to throw but it did not');
    } catch (error: unknown) {
        t.is(
            (error as Error).message,
            'The following packages are listed more than once in dependencies or peerDependencies: foo',
        );
    }
});

test('throws when a bundle is listed twice in peerDependencies', (t) => {
    const options: BundleBuildOptions = {
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        name: 'the-package',
        version: 'the-version',
        mainPackageJson: {},
        peerDependencies: [
            { contents: [], packageJson: { name: 'foo', version: '42' } },
            { contents: [], packageJson: { name: 'foo', version: '42' } },
        ],
    };

    try {
        validateBundleBuildOptions(options);
        t.fail('Expected validateBundleBuildOptions() to throw but it did not');
    } catch (error: unknown) {
        t.is(
            (error as Error).message,
            'The following packages are listed more than once in dependencies or peerDependencies: foo',
        );
    }
});

test('doesn’t throw when a bundle is listed only once', (t) => {
    const options: BundleBuildOptions = {
        sourcesFolder: '',
        entryPoints: [{ js: '' }],
        name: 'the-package',
        version: 'the-version',
        mainPackageJson: {},
        dependencies: [{ contents: [], packageJson: { name: 'foo', version: '42' } }],
    };

    t.notThrows(() => {
        validateBundleBuildOptions(options);
    });
});
