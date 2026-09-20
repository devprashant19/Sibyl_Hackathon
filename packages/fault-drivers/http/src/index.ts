import { FaultDriver, DriverContext } from '@sibyl-core';
import { FaultSpec } from '@sibyl-shared';
import { ClientRequestInterceptor } from '@mswjs/interceptors/ClientRequest';
import { FetchInterceptor } from '@mswjs/interceptors/fetch';

export class HttpFaultDriver implements FaultDriver {
  domain = 'HTTP' as const;
  private interceptors = [
    new ClientRequestInterceptor(),
    new FetchInterceptor()
  ];
  private context?: DriverContext;

  install(context: DriverContext) {
    if (this.context) return;
    this.context = context;
    this.interceptors.forEach(interceptor => interceptor.apply());
    
    this.interceptors.forEach(interceptor => {
      interceptor.on('request', async ({ request, controller }) => {
        if (!this.context) return;
        
        const metadata = {
          url: request.url,
          method: request.method
        };
        
        const fault = this.context.getFaultDecision(this.domain, metadata);
        
        if (!fault) {
          // Pass through to real network
          return;
        }

        // Apply Fault
        await this.applyFault(fault, request, controller);
      });
    });
  }

  uninstall() {
    this.interceptors.forEach(i => i.dispose());
    this.context = undefined;
  }

  private async applyFault(fault: FaultSpec, request: Request, controller: any) {
    const faultAny = fault as any; // Cast for flexibility with optional fields
    const delay = faultAny.delayMs || 5000; // Default delays if not specified

    // Log the event
    if (this.context) {
      this.context.recordEvent({
        domain: this.domain,
        payload: { method: request.method, url: request.url, statusCode: faultAny.statusCode || 0, durationMs: delay }
      } as any);
    }

    if (fault.type === 'SLOW_RESPONSE') {
      // Delay using the virtual clock (via the globally patched setTimeout)
      // Since it's awaited, MSW will hold the request from hitting the network.
      // In accelerated mode, this wait is instantaneous virtually.
      await new Promise(resolve => setTimeout(resolve, delay));
      // Then let it pass through to the real network by returning without respondWith
      return;
    }

    if (fault.type === 'TIMEOUT') {
      // Delay before the connection officially drops
      await new Promise(resolve => setTimeout(resolve, delay));
      controller.errorWith(new Error('ETIMEDOUT'));
      return;
    }

    if (fault.type === 'CONNECTION_REFUSED') {
      controller.errorWith(new Error('ECONNREFUSED'));
      return;
    }

    if (fault.type === 'HTTP_5XX' || fault.type === 'HTTP_4XX') {
      const status = faultAny.statusCode || (fault.type === 'HTTP_5XX' ? 500 : 400);
      controller.respondWith(new Response(null, { status }));
      return;
    }

    if (fault.type === 'PARTIAL_RESPONSE') {
      // Simulate partial response by streaming some data then violently crashing the stream
      const stream = new ReadableStream({
        start(streamController) {
          streamController.enqueue(new TextEncoder().encode('{"partial": true,'));
          // Wait a tiny bit (virtually) then crash
          setTimeout(() => {
            streamController.error(new Error('ECONNRESET'));
          }, 50);
        }
      });
      controller.respondWith(new Response(stream, { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
      return;
    }
  }
}
