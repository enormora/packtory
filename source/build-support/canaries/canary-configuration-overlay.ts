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
            'function withPublishSettings(settings, billOfMaterialsField) {',
            '    const { sbom, softwareBillOfMaterials, ...rest } = settings;',
            '    const billOfMaterials = softwareBillOfMaterials ?? sbom;',
            '    return { ...rest, [billOfMaterialsField]: { ...billOfMaterials, enabled: false } };',
            '}',
            '',
            'function withDeadCodeElimination(settings) {',
            '    return { ...settings, enabled: true };',
            '}',
            '',
            'function withExistingPublishSettings(settings, billOfMaterialsField) {',
            '    return settings.publishSettings === undefined',
            '        ? {}',
            '        : { publishSettings: withPublishSettings(settings.publishSettings, billOfMaterialsField) };',
            '}',
            '',
            'function withPackageDeadCodeElimination(settings) {',
            '    return settings.deadCodeElimination === undefined',
            '        ? {}',
            '        : { deadCodeElimination: withDeadCodeElimination(settings.deadCodeElimination) };',
            '}',
            '',
            'function withCommonSettings(settings = {}, billOfMaterialsField) {',
            '    return {',
            '        ...settings,',
            '        deadCodeElimination: withDeadCodeElimination(settings.deadCodeElimination),',
            '        ...withExistingPublishSettings(settings, billOfMaterialsField)',
            '    };',
            '}',
            '',
            'function withPackageSettings(settings, billOfMaterialsField) {',
            '    return {',
            '        ...settings,',
            '        ...withPackageDeadCodeElimination(settings),',
            '        ...withExistingPublishSettings(settings, billOfMaterialsField)',
            '    };',
            '}',
            '',
            'function withCanarySettings(configuration, billOfMaterialsField) {',
            '    return {',
            '        ...configuration,',
            '        commonPackageSettings: withCommonSettings(',
            '            configuration.commonPackageSettings, billOfMaterialsField',
            '        ),',
            '        packages: configuration.packages.map(function (packageConfiguration) {',
            '            return withPackageSettings(packageConfiguration, billOfMaterialsField);',
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
            "    return withCanarySettings(await loadOriginalConfiguration(), 'softwareBillOfMaterials');",
            '}',
            '',
            'export async function buildConfig() {',
            "    return withCanarySettings(await loadOriginalConfiguration(), 'sbom');",
            '}',
            ''
        ]
            .join('\n')
    );
}
