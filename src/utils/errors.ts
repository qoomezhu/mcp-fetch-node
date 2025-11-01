export enum ErrorCode {
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  DNS_FAILURE = 'DNS_FAILURE',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  CLIENT_ERROR_4XX = 'CLIENT_ERROR_4XX',
  SERVER_ERROR_5XX = 'SERVER_ERROR_5XX',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  ROBOTS_TXT_BLOCKED = 'ROBOTS_TXT_BLOCKED',
  FETCH_ERROR = 'FETCH_ERROR',
  ABORT_ERROR = 'ABORT_ERROR',
}

export enum ErrorType {
  RETRYABLE = 'RETRYABLE',
  NON_RETRYABLE = 'NON_RETRYABLE',
}

export class FetchError extends Error {
  public readonly code: ErrorCode;
  public readonly type: ErrorType;
  public readonly statusCode?: number;
  public readonly retryAfter?: number;

  constructor(
    message: string,
    code: ErrorCode,
    type: ErrorType,
    options?: {
      cause?: unknown;
      statusCode?: number;
      retryAfter?: number;
    },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'FetchError';
    this.code = code;
    this.type = type;
    this.statusCode = options?.statusCode;
    this.retryAfter = options?.retryAfter;
  }

  toUserMessage(): string {
    switch (this.code) {
      case ErrorCode.NETWORK_TIMEOUT:
        return 'The request timed out. The server took too long to respond.';
      case ErrorCode.DNS_FAILURE:
        return 'Unable to resolve the domain name. Please check the URL.';
      case ErrorCode.CONNECTION_ERROR:
        return 'Failed to establish a connection to the server.';
      case ErrorCode.CLIENT_ERROR_4XX:
        return `Request failed with client error (${String(this.statusCode ?? 'unknown')}). ${this.getClientErrorMessage()}`;
      case ErrorCode.SERVER_ERROR_5XX:
        return `The server encountered an error (${String(this.statusCode ?? 'unknown')}). Please try again later.`;
      case ErrorCode.CIRCUIT_BREAKER_OPEN:
        return 'Too many recent failures for this domain. Temporarily blocking requests to protect the service.';
      case ErrorCode.ROBOTS_TXT_BLOCKED:
        return 'Access to this URL is blocked by the robots.txt file.';
      case ErrorCode.ABORT_ERROR:
        return 'The request was aborted or cancelled.';
      default:
        return 'An unexpected error occurred while fetching the URL.';
    }
  }

  private getClientErrorMessage(): string {
    switch (this.statusCode) {
      case 400:
        return 'Bad request.';
      case 401:
        return 'Authentication required.';
      case 403:
        return 'Access forbidden.';
      case 404:
        return 'Resource not found.';
      case 429:
        return 'Rate limit exceeded. Please try again later.';
      default:
        return 'The request was invalid.';
    }
  }
}

export function classifyError(error: unknown, url?: string): FetchError {
  if (error instanceof FetchError) {
    return error;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : '';
  const lowerMessage = errorMessage.toLowerCase();

  if (errorName === 'AbortError' || lowerMessage.includes('aborted')) {
    return new FetchError(
      'Request was aborted',
      ErrorCode.ABORT_ERROR,
      ErrorType.NON_RETRYABLE,
      { cause: error },
    );
  }

  if (
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('timed out') ||
    errorName === 'TimeoutError'
  ) {
    return new FetchError(
      `Request timed out${url ? ` for ${url}` : ''}`,
      ErrorCode.NETWORK_TIMEOUT,
      ErrorType.RETRYABLE,
      { cause: error },
    );
  }

  if (
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('getaddrinfo') ||
    lowerMessage.includes('dns')
  ) {
    return new FetchError(
      `DNS resolution failed${url ? ` for ${url}` : ''}`,
      ErrorCode.DNS_FAILURE,
      ErrorType.NON_RETRYABLE,
      { cause: error },
    );
  }

  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('econnreset') ||
    lowerMessage.includes('epipe') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('socket')
  ) {
    return new FetchError(
      `Connection error${url ? ` for ${url}` : ''}`,
      ErrorCode.CONNECTION_ERROR,
      ErrorType.RETRYABLE,
      { cause: error },
    );
  }

  return new FetchError(
    `Unexpected error${url ? ` fetching ${url}` : ''}`,
    ErrorCode.FETCH_ERROR,
    ErrorType.RETRYABLE,
    { cause: error },
  );
}

export function createHttpError(
  url: string,
  statusCode: number,
  statusText: string,
): FetchError {
  if (statusCode >= 400 && statusCode < 500) {
    return new FetchError(
      `HTTP ${String(statusCode)} ${statusText} for ${url}`,
      ErrorCode.CLIENT_ERROR_4XX,
      ErrorType.NON_RETRYABLE,
      { statusCode },
    );
  }

  if (statusCode >= 500 && statusCode < 600) {
    return new FetchError(
      `HTTP ${String(statusCode)} ${statusText} for ${url}`,
      ErrorCode.SERVER_ERROR_5XX,
      ErrorType.RETRYABLE,
      { statusCode },
    );
  }

  return new FetchError(
    `HTTP ${String(statusCode)} ${statusText} for ${url}`,
    ErrorCode.FETCH_ERROR,
    ErrorType.NON_RETRYABLE,
    { statusCode },
  );
}
