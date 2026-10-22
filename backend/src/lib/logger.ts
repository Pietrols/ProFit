import { pino, type DestinationStream, type Logger } from 'pino';
import type { Config } from '../config.js';
import { safeErrorDetails } from './errorDetails.js';

export function createLogger(
  config: Pick<Config, 'LOG_LEVEL' | 'NODE_ENV'>,
  destination?: DestinationStream,
): Logger {
  const pretty = config.NODE_ENV === 'development' && !destination;
  return pino(
    {
      serializers: { err: safeErrorDetails },
      level: config.NODE_ENV === 'test' ? 'silent' : config.LOG_LEVEL,
      ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
    },
    destination,
  );
}
