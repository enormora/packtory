import path from 'node:path';
import type { FileManager } from '../../file-manager/file-manager.ts';

const originalConfigurationFileName = 'packtory.config.canary-original.js';

type OverlayFileManager = Pick<FileManager, 'copyFile' | 'writeFile'>;

export type CanaryConfigurationOverlayInput = {
    readonly cloneFolder: string;
    readonly fileManager: OverlayFileManager;
};

export async function writeCanaryConfigurationOverlay(input: CanaryConfigurationOverlayInput): Promise<void> {
    const configurationPath = path.join(input.cloneFolder, 'packtory.config.js');
    const originalConfigurationPath = path.join(input.cloneFolder, originalConfigurationFileName);
    await input.fileManager.copyFile(configurationPath, originalConfigurationPath);
    await input.fileManager.writeFile(
        configurationPath,
        [
            `import * as original from './${originalConfigurationFileName}';`,
            '',
            'function withPublishSettings(settings) {',
            '    if (settings === undefined) {',
            '        return { softwareBillOfMaterials: { enabled: false } };',
            '    }',
            "    if ('sbom' in settings) {",
            '        return { ...settings, sbom: { ...settings.sbom, enabled: false } };',
            '    }',
            '    const softwareBillOfMaterials = { ...settings.softwareBillOfMaterials, enabled: false };',
            '    return { ...settings, softwareBillOfMaterials };',
            '}',
            '',
            'function withDeadCodeElimination(settings) {',
            '    return { ...settings, enabled: true };',
            '}',
            '',
            'function withExistingPublishSettings(settings) {',
            '    return settings.publishSettings === undefined',
            '        ? {}',
            '        : { publishSettings: withPublishSettings(settings.publishSettings) };',
            '}',
            '',
            'function withPackageDeadCodeElimination(settings) {',
            '    return settings.deadCodeElimination === undefined',
            '        ? {}',
            '        : { deadCodeElimination: withDeadCodeElimination(settings.deadCodeElimination) };',
            '}',
            '',
            'function withCommonSettings(settings = {}) {',
            '    return {',
            '        ...settings,',
            '        deadCodeElimination: withDeadCodeElimination(settings.deadCodeElimination),',
            '        ...withExistingPublishSettings(settings)',
            '    };',
            '}',
            '',
            'function withPackageSettings(settings) {',
            '    return {',
            '        ...settings,',
            '        ...withPackageDeadCodeElimination(settings),',
            '        ...withExistingPublishSettings(settings)',
            '    };',
            '}',
            '',
            'function withCanarySettings(configuration) {',
            '    return {',
            '        ...configuration,',
            '        commonPackageSettings: withCommonSettings(configuration.commonPackageSettings),',
            '        packages: configuration.packages.map(function (packageConfiguration) {',
            '            return withPackageSettings(packageConfiguration);',
            '        })',
            '    };',
            '}',
            '',
            'async function loadOriginalConfiguration() {',
            "    if ('buildConfig' in original) {",
            '        return await original.buildConfig();',
            '    }',
            "    if ('buildConfiguration' in original) {",
            '        return await original.buildConfiguration();',
            '    }',
            '    return original.configuration ?? original.config;',
            '}',
            '',
            'export async function buildConfiguration() {',
            '    return withCanarySettings(await loadOriginalConfiguration());',
            '}',
            '',
            'export { buildConfiguration as buildConfig };',
            ''
        ]
            .join('\n')
    );
}
