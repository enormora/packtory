import type { ProgressBroadcastProvider } from '../progress/progress-broadcaster.ts';
import type { ResolvedBundle } from '../resource-resolver/resolved-bundle.ts';
import type { LinkedBundle } from '../linker/linked-bundle.ts';
import type { MainPackageManifest } from '../configuration/package-manifest.ts';
import type { WorkspaceInspector } from './inspectors/inspect-workspace.ts';
import { inspectScanResults } from './inspectors/inspect-scan-results.ts';
import { inspectLinkerRewrites } from './inspectors/inspect-linker-rewrites.ts';

export function reportResolvedBundle(
    provider: ProgressBroadcastProvider,
    bundle: ResolvedBundle,
    manifest: MainPackageManifest,
    inspectWorkspace: WorkspaceInspector
): void {
    if (provider.hasSubscribers('workspaceCaptured')) {
        const snapshot = inspectWorkspace(bundle, {
            dependencies: manifest.dependencies,
            peerDependencies: manifest.peerDependencies
        });
        provider.emit('workspaceCaptured', { packageName: bundle.name, snapshot });
    }
    if (provider.hasSubscribers('scanCompleted')) {
        provider.emit('scanCompleted', { packageName: bundle.name, ...inspectScanResults(bundle) });
    }
}

export function reportLinkedBundle(provider: ProgressBroadcastProvider, bundle: LinkedBundle): void {
    if (provider.hasSubscribers('linkingCompleted')) {
        provider.emit('linkingCompleted', { packageName: bundle.name, rewrites: inspectLinkerRewrites(bundle) });
    }
}
