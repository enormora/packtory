import type { ContinuousIntegrationEnvironment } from '../bundle-emitter/repository-coherence.ts';
import type { VersionSourceResolver } from '../packtory/map-configuration.ts';

export type PacktoryCompositionOptions = {
    readonly promptForOneTimePassword?: (() => Promise<string | undefined>) | undefined;
    readonly continuousIntegrationEnvironment: ContinuousIntegrationEnvironment;
    readonly repositoryFolder?: string | undefined;
    readonly resolveVersionSource?: VersionSourceResolver | undefined;
};
