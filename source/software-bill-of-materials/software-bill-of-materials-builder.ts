import { type ComponentScope, ComponentType } from '@cyclonedx/cyclonedx-library/Enums';
import { Bom, Component, LicenseExpression, NamedLicense } from '@cyclonedx/cyclonedx-library/Models';
import softwarePackageDataExchangeParse from 'spdx-expression-parse';

type SoftwareBillOfMaterialsRootComponent = {
    readonly name: string;
    readonly version: string;
};

export type SoftwareBillOfMaterialsDependency = {
    readonly name: string;
    readonly specifier: string;
    readonly scope: ComponentScope;
    readonly license: string | undefined;
};

export type SoftwareBillOfMaterialsBuilderOptions = {
    readonly toolVersion: string;
    readonly rootComponent: SoftwareBillOfMaterialsRootComponent;
    readonly dependencies: readonly SoftwareBillOfMaterialsDependency[];
};

function isParseableSoftwarePackageDataExchangeExpression(value: string): boolean {
    try {
        softwarePackageDataExchangeParse(value);
    } catch {
        return false;
    }
    return true;
}

function buildPackageAddress(name: string, versionOrSpecifier: string): string {
    return `pkg:npm/${name}@${encodeURIComponent(versionOrSpecifier)}`;
}

function buildRootComponent(rootComponent: SoftwareBillOfMaterialsRootComponent): Component {
    const packageAddress = buildPackageAddress(rootComponent.name, rootComponent.version);
    return new Component(ComponentType.Library, rootComponent.name, {
        version: rootComponent.version,
        bomRef: packageAddress,
        purl: packageAddress
    });
}

function buildDependencyComponent(dependency: SoftwareBillOfMaterialsDependency): Component {
    const packageAddress = buildPackageAddress(dependency.name, dependency.specifier);
    const component = new Component(ComponentType.Library, dependency.name, {
        version: dependency.specifier,
        bomRef: packageAddress,
        purl: packageAddress,
        scope: dependency.scope
    });
    if (dependency.license === undefined) {
        return component;
    }
    if (isParseableSoftwarePackageDataExchangeExpression(dependency.license)) {
        component.licenses.add(new LicenseExpression(dependency.license));
        return component;
    }
    component.licenses.add(new NamedLicense(dependency.license));
    return component;
}

function buildToolComponent(toolVersion: string): Component {
    return new Component(ComponentType.Application, 'packtory', {
        version: toolVersion
    });
}

export function buildSoftwareBillOfMaterials(options: SoftwareBillOfMaterialsBuilderOptions): Bom {
    const billOfMaterials = new Bom();
    billOfMaterials.metadata.tools.components.add(buildToolComponent(options.toolVersion));

    const rootComponent = buildRootComponent(options.rootComponent);
    billOfMaterials.metadata.component = rootComponent;

    for (const dependency of options.dependencies) {
        const component = buildDependencyComponent(dependency);
        billOfMaterials.components.add(component);
        rootComponent.dependencies.add(component.bomRef);
    }

    return billOfMaterials;
}
