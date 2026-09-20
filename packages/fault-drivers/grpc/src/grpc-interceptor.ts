import { Interceptor, InterceptorOptions, NextCall, InterceptingCall, Metadata, status } from '@grpc/grpc-js';
import type { GrpcFaultDriver } from './index';

export function createSibylGrpcInterceptor(driver: GrpcFaultDriver): Interceptor {
  return (options: InterceptorOptions, nextCall: NextCall) => {
    const method = options.method_definition.path; // e.g., '/helloworld.Greeter/SayHello'

    let fault: any = null;
    if (driver.context) {
      fault = driver.context.getFaultDecision('GRPC', { method });
      
      if (fault) {
        driver.context.recordEvent({
          domain: 'GRPC',
          payload: { method, statusCode: getStatusCodeForFault(fault.type) }
        } as any);
      }
    }

    const requester = {
      start: function (metadata: Metadata, listener: any, next: Function) {
        if (fault) {
          if (fault.type === 'UNAVAILABLE') {
            listener.onReceiveStatus({
              code: status.UNAVAILABLE,
              details: 'Injected UNAVAILABLE fault',
              metadata: new Metadata()
            });
            return;
          }
          if (fault.type === 'RESOURCE_EXHAUSTED') {
            listener.onReceiveStatus({
              code: status.RESOURCE_EXHAUSTED,
              details: 'Injected RESOURCE_EXHAUSTED fault',
              metadata: new Metadata()
            });
            return;
          }
          if (fault.type === 'DEADLINE_EXCEEDED') {
            const delay = fault.delayMs || 5000;
            setTimeout(() => {
              listener.onReceiveStatus({
                code: status.DEADLINE_EXCEEDED,
                details: 'Injected DEADLINE_EXCEEDED fault',
                metadata: new Metadata()
              });
            }, delay);
            return;
          }
        }
        next(metadata, listener);
      }
    };
    
    return new InterceptingCall(nextCall(options), requester);
  };
}

function getStatusCodeForFault(type: string): number {
  if (type === 'UNAVAILABLE') return status.UNAVAILABLE;
  if (type === 'RESOURCE_EXHAUSTED') return status.RESOURCE_EXHAUSTED;
  if (type === 'DEADLINE_EXCEEDED') return status.DEADLINE_EXCEEDED;
  return status.UNKNOWN;
}
