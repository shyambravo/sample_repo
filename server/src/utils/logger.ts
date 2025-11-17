/**
 * Structured logging utility for GCP Cloud Logging
 * Segregates logs into different categories: APP, LLM, SYSTEM
 * 
 * In GCP Cloud Logging, you can filter logs by:
 * - jsonPayload.logType="APP" for application logs
 * - jsonPayload.logType="LLM" for LLM/AI model logs
 * - jsonPayload.logType="SYSTEM" for system/infrastructure logs
 * - severity for log levels
 */

export enum LogType {
  APP = 'APP',
  LLM = 'LLM',
  SYSTEM = 'SYSTEM',
}

export enum LogSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

interface LogMetadata {
  [key: string]: any;
}

interface StructuredLog {
  timestamp: string;
  severity: LogSeverity;
  logType: LogType;
  message: string;
  component?: string;
  metadata?: LogMetadata;
  error?: {
    message: string;
    stack?: string;
    code?: string | number;
  };
}

class Logger {
  private readonly isProduction: boolean;
  private readonly enableConsoleFormatting: boolean;

  constructor() {
    // In GCP, NODE_ENV should be 'production' for structured JSON logging
    this.isProduction = process.env.NODE_ENV === 'production';
    // Enable console formatting for local development
    this.enableConsoleFormatting = !this.isProduction;
  }

  private formatLog(log: StructuredLog): string {
    if (this.enableConsoleFormatting) {
      // Human-readable format for local development
      const timestamp = new Date(log.timestamp).toLocaleTimeString();
      const severityColor = this.getSeverityColor(log.severity);
      const typeColor = this.getTypeColor(log.logType);
      const componentStr = log.component ? `[${log.component}]` : '';
      
      let output = `${timestamp} ${severityColor}${log.severity}\x1b[0m ${typeColor}${log.logType}\x1b[0m ${componentStr} ${log.message}`;
      
      if (log.metadata && Object.keys(log.metadata).length > 0) {
        output += `\n  Metadata: ${JSON.stringify(log.metadata, null, 2)}`;
      }
      
      if (log.error) {
        output += `\n  Error: ${log.error.message}`;
        if (log.error.stack) {
          output += `\n  Stack: ${log.error.stack}`;
        }
      }
      
      return output;
    } else {
      // Structured JSON for GCP Cloud Logging
      return JSON.stringify(log);
    }
  }

  private getSeverityColor(severity: LogSeverity): string {
    switch (severity) {
      case LogSeverity.INFO:
        return '\x1b[32m'; // Green
      case LogSeverity.WARNING:
        return '\x1b[33m'; // Yellow
      case LogSeverity.ERROR:
        return '\x1b[31m'; // Red
      default:
        return '\x1b[0m'; // Reset
    }
  }

  private getTypeColor(type: LogType): string {
    switch (type) {
      case LogType.APP:
        return '\x1b[34m'; // Blue
      case LogType.LLM:
        return '\x1b[35m'; // Magenta
      case LogType.SYSTEM:
        return '\x1b[36m'; // Cyan
      default:
        return '\x1b[0m'; // Reset
    }
  }

  private log(
    severity: LogSeverity,
    logType: LogType,
    message: string,
    component?: string,
    metadata?: LogMetadata,
    error?: Error | any,
  ): void {
    const structuredLog: StructuredLog = {
      timestamp: new Date().toISOString(),
      severity,
      logType,
      message,
      component,
      metadata,
    };

    if (error) {
      structuredLog.error = {
        message: error.message || String(error),
        stack: error.stack,
        code: error.code,
      };
    }

    const formatted = this.formatLog(structuredLog);
    
    // Write to appropriate stream based on severity
    if (severity === LogSeverity.ERROR) {
      console.error(formatted);
    } else {
      console.log(formatted);
    }
  }

  // Application logs
  appInfo(message: string, component?: string, metadata?: LogMetadata): void {
    this.log(LogSeverity.INFO, LogType.APP, message, component, metadata);
  }

  appWarning(message: string, component?: string, metadata?: LogMetadata): void {
    this.log(LogSeverity.WARNING, LogType.APP, message, component, metadata);
  }

  appError(message: string, component?: string, error?: Error | any, metadata?: LogMetadata): void {
    this.log(LogSeverity.ERROR, LogType.APP, message, component, metadata, error);
  }

  // LLM/AI logs
  llmInfo(message: string, component?: string, metadata?: LogMetadata): void {
    this.log(LogSeverity.INFO, LogType.LLM, message, component, metadata);
  }

  llmWarning(message: string, component?: string, metadata?: LogMetadata): void {
    this.log(LogSeverity.WARNING, LogType.LLM, message, component, metadata);
  }

  llmError(message: string, component?: string, error?: Error | any, metadata?: LogMetadata): void {
    this.log(LogSeverity.ERROR, LogType.LLM, message, component, metadata, error);
  }

  // System logs
  systemInfo(message: string, component?: string, metadata?: LogMetadata): void {
    this.log(LogSeverity.INFO, LogType.SYSTEM, message, component, metadata);
  }

  systemWarning(message: string, component?: string, metadata?: LogMetadata): void {
    this.log(LogSeverity.WARNING, LogType.SYSTEM, message, component, metadata);
  }

  systemError(message: string, component?: string, error?: Error | any, metadata?: LogMetadata): void {
    this.log(LogSeverity.ERROR, LogType.SYSTEM, message, component, metadata, error);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export convenience functions
export const logApp = {
  info: (msg: string, component?: string, meta?: LogMetadata) => logger.appInfo(msg, component, meta),
  warning: (msg: string, component?: string, meta?: LogMetadata) => logger.appWarning(msg, component, meta),
  error: (msg: string, component?: string, error?: Error | any, meta?: LogMetadata) => logger.appError(msg, component, error, meta),
};

export const logLLM = {
  info: (msg: string, component?: string, meta?: LogMetadata) => logger.llmInfo(msg, component, meta),
  warning: (msg: string, component?: string, meta?: LogMetadata) => logger.llmWarning(msg, component, meta),
  error: (msg: string, component?: string, error?: Error | any, meta?: LogMetadata) => logger.llmError(msg, component, error, meta),
};

export const logSystem = {
  info: (msg: string, component?: string, meta?: LogMetadata) => logger.systemInfo(msg, component, meta),
  warning: (msg: string, component?: string, meta?: LogMetadata) => logger.systemWarning(msg, component, meta),
  error: (msg: string, component?: string, error?: Error | any, meta?: LogMetadata) => logger.systemError(msg, component, error, meta),
};

