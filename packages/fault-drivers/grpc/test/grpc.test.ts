import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { GrpcFaultDriver } from '../src/index';

// 1. Mock a simple proto dynamically
const PROTO_DEF = `
syntax = "proto3";
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}
message HelloRequest {
  string name = 1;
}
message HelloReply {
  string message = 1;
}
`;

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let server: grpc.Server;
let client: any;
let clientNoIntercept: any;
let protoDescriptor: any;

const protoPath = path.join(os.tmpdir(), 'greeter.proto');

describe('GRPC Fault Driver', () => {
  let driver: GrpcFaultDriver;
  let mockGetFaultDecision: ReturnType<typeof vi.fn>;
  let mockRecordEvent: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    fs.writeFileSync(protoPath, PROTO_DEF);
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    });
    protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

    server = new grpc.Server();
    server.addService(protoDescriptor.Greeter.service, {
      sayHello: (call: any, callback: any) => {
        callback(null, { message: 'Hello ' + call.request.name });
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) return reject(err);
        server.start();

        driver = new GrpcFaultDriver();

        clientNoIntercept = new protoDescriptor.Greeter(
          `127.0.0.1:${port}`,
          grpc.credentials.createInsecure()
        );

        client = new protoDescriptor.Greeter(
          `127.0.0.1:${port}`,
          grpc.credentials.createInsecure(),
          { interceptors: [driver.createInterceptor()] }
        );
        resolve();
      });
    });
  });

  afterAll(() => {
    server.forceShutdown();
    client.close();
    clientNoIntercept.close();
    if (fs.existsSync(protoPath)) fs.unlinkSync(protoPath);
  });

  beforeEach(() => {
    if (!mockGetFaultDecision) {
      mockGetFaultDecision = vi.fn();
      mockRecordEvent = vi.fn();
    } else {
      mockGetFaultDecision.mockReset();
      mockRecordEvent.mockReset();
    }
    driver.uninstall();
    driver.install({
      clock: {} as any,
      getFaultDecision: mockGetFaultDecision,
      recordEvent: mockRecordEvent
    });
  });

  it('passes through when no fault is injected', async () => {
    mockGetFaultDecision.mockReturnValue(null);

    const response = await new Promise((resolve, reject) => {
      client.sayHello({ name: 'World' }, (err: any, res: any) => {
        if (err) return reject(err);
        resolve(res);
      });
    });

    expect(response).toEqual({ message: 'Hello World' });
    expect(mockGetFaultDecision).toHaveBeenCalledWith('GRPC', { method: '/Greeter/SayHello' });
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it('injects UNAVAILABLE status', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'GRPC',
      type: 'UNAVAILABLE'
    });

    const err: any = await new Promise((resolve) => {
      client.sayHello({ name: 'World' }, (err: any) => resolve(err));
    });

    expect(err).toBeDefined();
    expect(err.code).toBe(grpc.status.UNAVAILABLE);
    expect(err.details).toBe('Injected UNAVAILABLE fault');
    expect(mockRecordEvent).toHaveBeenCalledWith({
      domain: 'GRPC',
      payload: { method: '/Greeter/SayHello', statusCode: grpc.status.UNAVAILABLE }
    });
  });

  it('injects RESOURCE_EXHAUSTED status', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'GRPC',
      type: 'RESOURCE_EXHAUSTED'
    });

    const err: any = await new Promise((resolve) => {
      client.sayHello({ name: 'World' }, (err: any) => resolve(err));
    });

    expect(err.code).toBe(grpc.status.RESOURCE_EXHAUSTED);
  });

  it('injects DEADLINE_EXCEEDED status with delay', async () => {
    mockGetFaultDecision.mockReturnValue({
      domain: 'GRPC',
      type: 'DEADLINE_EXCEEDED',
      delayMs: 10
    });

    const start = Date.now();
    const err: any = await new Promise((resolve) => {
      client.sayHello({ name: 'World' }, (err: any) => resolve(err));
    });
    const duration = Date.now() - start;

    expect(err.code).toBe(grpc.status.DEADLINE_EXCEEDED);
    expect(duration).toBeGreaterThanOrEqual(10);
  });
});
