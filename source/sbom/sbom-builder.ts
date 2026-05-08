import * as cdx from '@cyclonedx/cyclonedx-library';
import spdxParse from 'spdx-expression-parse';

type SbomRootComponent = {
    readonly name: string;
    readonly version: string;
};

export type SbomDependencyKind = 'peer' | 'runtime';

export type SbomDependency = {
    readonly name: string;
    readonly specifier: string;
    readonly kind: SbomDependencyKind;
    readonly license: string | undefined;
};

type SbomBuilderOptions = {
    readonly toolVersion: string;
    readonly rootComponent: SbomRootComponent;
    readonly dependencies: readonly SbomDependency[];
};

function isParseableSpdxExpression(value: string): boolean {
    try {
        spdxParse(value);
    } catch {
        return false;
    }
    return true;
}

function buildPurl(name: string, versionOrSpecifier: string): string {
    return `pkg:npm/${name}@${encodeURIComponent(versionOrSpecifier)}`;
}

const componentScopeByKind: Readonly<Record<SbomDependencyKind, cdx.Enums.ComponentScope>> = {
    peer: cdx.Enums.ComponentScope.Optional,
    runtime: cdx.Enums.ComponentScope.Required
};

function scopeFor(kind: SbomDependencyKind): cdx.Enums.ComponentScope {
    return componentScopeByKind[kind];
}

function attachLicense(component: cdx.Models.Component, license: string | undefined): void {
    if (license === undefined) {
        return;
    }
    if (isParseableSpdxExpression(license)) {
        component.licenses.add(new cdx.Models.LicenseExpression(license));
        return;
    }
    component.licenses.add(new cdx.Models.NamedLicense(license));
}

function buildRootComponent(rootComponent: SbomRootComponent): cdx.Models.Component {
    const purl = buildPurl(rootComponent.name, rootComponent.version);
    return new cdx.Models.Component(cdx.Enums.ComponentType.Library, rootComponent.name, {
        version: rootComponent.version,
        bomRef: purl,
        purl
    });
}

function buildDependencyComponent(dependency: SbomDependency): cdx.Models.Component {
    const purl = buildPurl(dependency.name, dependency.specifier);
    const component = new cdx.Models.Component(cdx.Enums.ComponentType.Library, dependency.name, {
        version: dependency.specifier,
        bomRef: purl,
        purl,
        scope: scopeFor(dependency.kind)
    });
    attachLicense(component, dependency.license);
    return component;
}

function buildToolComponent(toolVersion: string): cdx.Models.Component {
    return new cdx.Models.Component(cdx.Enums.ComponentType.Application, 'packtory', {
        version: toolVersion
    });
}

export function buildSbom(options: SbomBuilderOptions): cdx.Models.Bom {
    const bom = new cdx.Models.Bom();
    bom.metadata.tools.components.add(buildToolComponent(options.toolVersion));

    const rootComponent = buildRootComponent(options.rootComponent);
    bom.metadata.component = rootComponent;

    for (const dependency of options.dependencies) {
        const component = buildDependencyComponent(dependency);
        bom.components.add(component);
        rootComponent.dependencies.add(component.bomRef);
    }

    return bom;
}
