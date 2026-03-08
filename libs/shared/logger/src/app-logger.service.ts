import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class AppLogger {
  private readonly logger = new Logger("Truckmoov");

  log(message: string, context?: Record<string, unknown>) {
    this.logger.log(this.toLine(message, context));
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.logger.warn(this.toLine(message, context));
  }

  error(message: string, context?: Record<string, unknown>) {
    this.logger.error(this.toLine(message, context));
  }

  private toLine(message: string, context?: Record<string, unknown>) {
    return JSON.stringify({
      message,
      context: context ?? null,
      time: new Date().toISOString(),
    });
  }
}
