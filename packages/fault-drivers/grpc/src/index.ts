import { FaultDriver, DriverContext } from '@sibyl-core';
import { Interceptor } from '@grpc/grpc-js';
import { createSibylGrpcInterceptor } from './grpc-interceptor';

export class GrpcFaultDriver implements FaultDriver {
  domain = 'GRPC' as const;
  context?: DriverContext;

  install(context: DriverContext) {
    if (this.context) return;
    this.context = context;
  }

  uninstall() {
    if (!this.context) return;
    this.context = undefined;
  }

  createInterceptor(): Interceptor {
    return createSibylGrpcInterceptor(this);
  }
}
