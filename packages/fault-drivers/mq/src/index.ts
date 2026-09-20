import { FaultDriver, DriverContext } from '@sibyl-core';
import { wrapKafka } from './kafka-wrapper';
import { wrapSqsClient } from './sqs-wrapper';

export class MqFaultDriver implements FaultDriver {
  domain = 'MESSAGE_QUEUE' as const;
  context?: DriverContext;

  install(context: DriverContext) {
    if (this.context) return;
    this.context = context;
  }

  uninstall() {
    if (!this.context) return;
    this.context = undefined;
  }

  wrapKafka(kafka: any): any {
    return wrapKafka(kafka, this);
  }

  wrapSqsClient(client: any): any {
    return wrapSqsClient(client, this);
  }
}
