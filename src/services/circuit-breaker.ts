import { ErrorCode, ErrorType, FetchError } from '../utils/errors.js';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  cooldownPeriod: number;
  halfOpenMaxAttempts: number;
}

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownPeriod: 60000,
  halfOpenMaxAttempts: 3,
};

interface CircuitStats {
  state: CircuitBreakerState;
  failures: number;
  lastFailureTime: number;
  halfOpenAttempts: number;
  successCount: number;
}

export class CircuitBreaker {
  private readonly circuits = new Map<string, CircuitStats>();
  private readonly config: CircuitBreakerConfig;

  constructor(config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {
    this.config = config;
  }

  private getDomain(url: string): string {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  }

  private getOrCreateCircuit(domain: string): CircuitStats {
    let circuit = this.circuits.get(domain);
    if (!circuit) {
      circuit = {
        state: CircuitBreakerState.CLOSED,
        failures: 0,
        lastFailureTime: 0,
        halfOpenAttempts: 0,
        successCount: 0,
      };
      this.circuits.set(domain, circuit);
    }
    return circuit;
  }

  private transitionState(
    domain: string,
    circuit: CircuitStats,
    newState: CircuitBreakerState,
  ): void {
    const oldState = circuit.state;
    circuit.state = newState;

    if (oldState !== newState) {
      console.log(
        `[CircuitBreaker] ${domain}: ${oldState} -> ${newState} (failures: ${String(circuit.failures)})`,
      );
    }

    if (newState === CircuitBreakerState.OPEN) {
      circuit.lastFailureTime = Date.now();
    } else if (newState === CircuitBreakerState.HALF_OPEN) {
      circuit.halfOpenAttempts = 0;
      circuit.successCount = 0;
    } else {
      circuit.failures = 0;
      circuit.successCount = 0;
      circuit.halfOpenAttempts = 0;
    }
  }

  private checkAndUpdateState(domain: string, circuit: CircuitStats): void {
    if (circuit.state === CircuitBreakerState.OPEN) {
      const timeSinceLastFailure = Date.now() - circuit.lastFailureTime;
      if (timeSinceLastFailure >= this.config.cooldownPeriod) {
        this.transitionState(domain, circuit, CircuitBreakerState.HALF_OPEN);
      }
    }
  }

  async execute<T>(url: string, fn: () => Promise<T>): Promise<T> {
    const domain = this.getDomain(url);
    const circuit = this.getOrCreateCircuit(domain);

    this.checkAndUpdateState(domain, circuit);

    if (circuit.state === CircuitBreakerState.OPEN) {
      console.warn(
        `[CircuitBreaker] Circuit OPEN for ${domain}, rejecting request`,
      );
      throw new FetchError(
        `Circuit breaker is open for ${domain}`,
        ErrorCode.CIRCUIT_BREAKER_OPEN,
        ErrorType.NON_RETRYABLE,
      );
    }

    if (circuit.state === CircuitBreakerState.HALF_OPEN) {
      if (circuit.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        console.warn(
          `[CircuitBreaker] Half-open attempt limit reached for ${domain}, rejecting request`,
        );
        throw new FetchError(
          `Circuit breaker is testing recovery for ${domain}`,
          ErrorCode.CIRCUIT_BREAKER_OPEN,
          ErrorType.NON_RETRYABLE,
        );
      }
      circuit.halfOpenAttempts++;
    }

    try {
      const result = await fn();

      if (circuit.state === CircuitBreakerState.HALF_OPEN) {
        circuit.successCount++;
        if (circuit.successCount >= 2) {
          this.transitionState(domain, circuit, CircuitBreakerState.CLOSED);
        }
      } else {
        circuit.failures = Math.max(0, circuit.failures - 1);
      }

      return result;
    } catch (error) {
      const fetchError =
        error instanceof FetchError
          ? error
          : new FetchError(
              'Unexpected error',
              ErrorCode.FETCH_ERROR,
              ErrorType.RETRYABLE,
              { cause: error },
            );

      if (fetchError.type === ErrorType.RETRYABLE) {
        circuit.failures++;

        if (circuit.state === CircuitBreakerState.HALF_OPEN) {
          console.warn(
            `[CircuitBreaker] Half-open test failed for ${domain}, reopening circuit`,
          );
          this.transitionState(domain, circuit, CircuitBreakerState.OPEN);
        } else if (circuit.failures >= this.config.failureThreshold) {
          console.error(
            `[CircuitBreaker] Failure threshold (${String(this.config.failureThreshold)}) reached for ${domain}, opening circuit`,
          );
          this.transitionState(domain, circuit, CircuitBreakerState.OPEN);
        }
      }

      throw fetchError;
    }
  }

  getState(url: string): CircuitBreakerState {
    const domain = this.getDomain(url);
    const circuit = this.circuits.get(domain);
    return circuit?.state ?? CircuitBreakerState.CLOSED;
  }

  reset(url?: string): void {
    if (url) {
      const domain = this.getDomain(url);
      this.circuits.delete(domain);
      console.log(`[CircuitBreaker] Reset circuit for ${domain}`);
    } else {
      this.circuits.clear();
      console.log('[CircuitBreaker] Reset all circuits');
    }
  }

  getStats(): Map<string, CircuitStats> {
    return new Map(this.circuits);
  }
}
