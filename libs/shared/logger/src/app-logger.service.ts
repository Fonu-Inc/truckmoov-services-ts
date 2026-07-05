import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class AppLogger {
  private readonly logger = new Logger("Truckmoov");

  log(message: string, context?: Record<string, unknown>) {
    this.logger.log(message, ...(context ? [context] : []));
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.logger.warn(message, ...(context ? [context] : []));
  }

  error(message: string, context?: Record<string, unknown>) {
    this.logger.error(message, ...(context ? [context] : []));
  }
}
