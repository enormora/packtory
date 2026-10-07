import assert from 'node:assert';
import { suite, test } from 'mocha';
import { createVendorPackageLocations, type VendorPackageLocations } from './vendor-package-locations.ts';

function locatePackage(
    locations: VendorPackageLocations,
    name: string,
    realPath: string,
    targetFolder: string
): ReturnType<VendorPackageLocations['locate']> {
    return locations.locate({ name, realPath, targetFolder });
}

suite('vendor-package-locations', function () {
    test('hoists unrelated installations without treating a sibling as a nested package', function () {
        const locations = createVendorPackageLocations();
        locatePackage(locations, 'parent', '/store/parent', '');
        assert.deepStrictEqual(
            locatePackage(locations, 'dependency', '/store/elsewhere/node_modules/dependency', 'node_modules/parent'),
            { directory: 'node_modules/dependency', alreadyCollected: false }
        );
    });

    test('uses the closest physical parent to preserve nested installations below an alias', function () {
        const locations = createVendorPackageLocations();
        locatePackage(locations, 'root', '/store/root', '');
        locatePackage(locations, 'alias', '/hoisted/alias', '');
        const nestedAlias = locatePackage(
            locations,
            'alias',
            '/store/root/node_modules/physical',
            'node_modules/root'
        );
        assert.strictEqual(nestedAlias.directory, 'node_modules/root/node_modules/alias');
        locatePackage(locations, 'consumer', '/hoisted/consumer', '');
        const consumer = locatePackage(locations, 'consumer', '/another/consumer', nestedAlias.directory);
        assert.deepStrictEqual(
            locatePackage(
                locations,
                'dependency',
                '/store/root/node_modules/physical/node_modules/dependency',
                consumer.directory
            ),
            { directory: 'node_modules/root/node_modules/alias/node_modules/dependency', alreadyCollected: false }
        );
    });

    test('reuses a reachable installation while keeping different installed versions separate', function () {
        const locations = createVendorPackageLocations();
        locatePackage(locations, '@scope/dependency', '/store/version-1', '');
        assert.deepStrictEqual(
            locatePackage(locations, '@scope/dependency', '/store/version-1', 'node_modules/consumer'),
            { directory: 'node_modules/@scope/dependency', alreadyCollected: true }
        );
        assert.deepStrictEqual(
            locatePackage(locations, '@scope/dependency', '/store/version-2', 'node_modules/consumer'),
            { directory: 'node_modules/consumer/node_modules/@scope/dependency', alreadyCollected: false }
        );
    });

    test('retains distinct import names for aliases of the same physical installation', function () {
        const locations = createVendorPackageLocations();
        locatePackage(locations, 'original', '/store/physical', '');
        assert.deepStrictEqual(
            locatePackage(locations, 'alias', '/store/physical', 'node_modules/consumer'),
            { directory: 'node_modules/consumer/node_modules/alias', alreadyCollected: false }
        );
    });
});
