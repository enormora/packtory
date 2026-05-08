import { readCiEnvironment } from '../../bundle-emitter/repository-coherence.ts';
import { buildPackageProcessorComposition } from '../package-processor.composition.ts';

export const { packageProcessor } = buildPackageProcessorComposition({
    ciEnvironment: readCiEnvironment(process.env)
});
