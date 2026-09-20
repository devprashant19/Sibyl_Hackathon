import { FaultDriver, DriverContext } from '@sibyl-core';
import { wrapChildProcess } from './process-wrapper';

export class ProcessFaultDriver implements FaultDriver {
  domain = 'PROCESS' as const;
  context?: DriverContext;

  install(context: DriverContext) {
    this.context = context;
  }

  uninstall() {
    this.context = undefined;
  }

  wrapChildProcess(cpModule: any): any {
    return wrapChildProcess(cpModule, this);
  }
}
