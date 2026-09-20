import { buildProgram } from './index';
import { handleError } from './errors';

buildProgram().parseAsync(process.argv).catch(handleError);
