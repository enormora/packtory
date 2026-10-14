import { readContinuousIntegrationEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import { buildPackageProcessorComposition } from '../package-processor.composition.ts';

export const { packageProcessor } = buildPackageProcessorComposition({
    continuousIntegrationEnvironment: readContinuousIntegrationEnvironment(process.env)
});
