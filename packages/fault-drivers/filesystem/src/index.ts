import { FaultDriver, DriverContext } from '@sibyl-core';
import { wrapFs, wrapFsPromises } from './fs-wrapper';

export class FilesystemFaultDriver implements FaultDriver {
  domain = 'FILESYSTEM' as const;
  context?: DriverContext;

  install(context: DriverContext) {
    this.context = context;
  }

  uninstall() {
    this.context = undefined;
  }

  wrapFs(fsModule: any): any {
    return wrapFs(fsModule, this);
  }

  wrapFsPromises(fsPromisesModule: any): any {
    return wrapFsPromises(fsPromisesModule, this);
  }
}
