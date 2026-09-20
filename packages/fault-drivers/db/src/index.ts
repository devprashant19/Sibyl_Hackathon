import { FaultDriver, DriverContext } from '@sibyl-core';
import { wrapPgPool } from './pg-wrapper';
import { wrapMysql2Pool } from './mysql2-wrapper';

export class DatabaseFaultDriver implements FaultDriver {
  domain = 'DATABASE' as const;
  context?: DriverContext;

  install(context: DriverContext) {
    this.context = context;
  }

  uninstall() {
    this.context = undefined;
  }

  wrapPgPool(pool: any): any {
    return wrapPgPool(pool, this);
  }

  wrapMysql2Pool(pool: any): any {
    return wrapMysql2Pool(pool, this);
  }
}
