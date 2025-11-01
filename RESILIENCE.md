# Resilience and Error Handling

This document describes the resilience features implemented in the MCP Fetch Node server, including error handling, retry strategies, circuit breaker patterns, and timeout controls.

## Overview

The server implements multiple layers of resilience to ensure reliable operation in unstable network environments:

1. **Error Classification and Handling** - Intelligent error categorization
2. **Exponential Backoff Retry** - Automatic retry with smart delays
3. **Circuit Breaker Pattern** - Protection against cascading failures
4. **Request Timeouts** - Configurable timeout controls
5. **User-Friendly Error Messages** - Clear, actionable error reporting

## Error Classification

The server classifies errors into distinct categories, each with appropriate handling strategies:

### Error Types

- **Network Timeout** (`NETWORK_TIMEOUT`) - Retryable

  - Triggered when requests exceed the timeout threshold
  - Automatically retried with exponential backoff

- **DNS Failure** (`DNS_FAILURE`) - Non-retryable

  - Domain name resolution failures
  - Not retried as DNS issues are typically persistent

- **Connection Error** (`CONNECTION_ERROR`) - Retryable

  - TCP connection failures (ECONNREFUSED, ECONNRESET, etc.)
  - Retried as connections may be temporarily unavailable

- **4xx Client Errors** (`CLIENT_ERROR_4XX`) - Non-retryable

  - Bad requests, authentication failures, not found, etc.
  - Not retried as these indicate issues with the request itself

- **5xx Server Errors** (`SERVER_ERROR_5XX`) - Retryable

  - Server-side failures
  - Retried as servers may recover

- **Circuit Breaker Open** (`CIRCUIT_BREAKER_OPEN`) - Non-retryable

  - Too many failures for a domain
  - Requests blocked temporarily to protect the service

- **Robots.txt Blocked** (`ROBOTS_TXT_BLOCKED`) - Non-retryable
  - Access denied by robots.txt rules

## Retry Strategy

The server implements exponential backoff with jitter for automatic retries.

### Configuration

```bash
# Retry configuration
--retry-max-attempts 3        # Maximum retry attempts (default: 3)
--retry-initial-delay 1000    # Initial delay in ms (default: 1000)
--retry-max-delay 10000       # Maximum delay in ms (default: 10000)
```

### Behavior

1. **Exponential Backoff**: Each retry waits progressively longer

   - Attempt 1: ~1 second
   - Attempt 2: ~2 seconds
   - Attempt 3: ~4 seconds (capped at max-delay)

2. **Jitter**: Random variance (±30%) added to delays to prevent thundering herd

3. **Selective Retry**: Only retryable errors are retried
   - ✅ Retried: Timeouts, 5xx errors, connection errors
   - ❌ Not retried: 4xx errors, DNS failures, circuit breaker blocks

### Example

```javascript
// Retries up to 3 times with exponential backoff
const result = await fetch('https://example.com');
```

## Circuit Breaker

The circuit breaker pattern prevents cascading failures by temporarily blocking requests to failing domains.

### States

1. **CLOSED** (Normal operation)

   - Requests pass through normally
   - Failures are tracked

2. **OPEN** (Circuit tripped)

   - Requests immediately fail with `CIRCUIT_BREAKER_OPEN` error
   - No actual network requests are made
   - Remains open for the cooldown period

3. **HALF_OPEN** (Testing recovery)
   - Limited test requests allowed
   - Success transitions back to CLOSED
   - Failure transitions back to OPEN

### Configuration

```bash
# Circuit breaker configuration
--circuit-breaker-threshold 5   # Failures before opening (default: 5)
--circuit-breaker-cooldown 60000 # Cooldown period in ms (default: 60000)
```

### Domain Isolation

Circuit breakers are isolated per domain:

- Failures on `example.com` don't affect `other.com`
- Sub-paths share the same circuit (`example.com/page1` and `example.com/page2`)

### Example Scenario

```
1. 5 consecutive failures to example.com
   → Circuit opens

2. Next 60 seconds: All requests to example.com rejected immediately
   → Prevents wasting resources on a failing service

3. After 60 seconds: Circuit enters HALF_OPEN
   → Allows 2-3 test requests

4. If tests succeed: Circuit closes, normal operation resumes
5. If tests fail: Circuit reopens for another cooldown period
```

## Request Timeouts

Each request has a configurable timeout to prevent indefinite waiting.

### Configuration

```bash
# Request timeout
--request-timeout 30000  # Timeout in ms (default: 30000)
```

### Behavior

- Uses `AbortController` to cancel requests that exceed the timeout
- Timeout errors are classified as `NETWORK_TIMEOUT` and are retryable
- Proper resource cleanup on timeout

### Example

```bash
# Set 10-second timeout for all requests
npx -y mcp-fetch-node --request-timeout 10000
```

## User-Friendly Error Messages

Error responses are designed to be informative without exposing sensitive information.

### Error Response Format

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: The request timed out. The server took too long to respond."
    }
  ],
  "isError": true
}
```

### Message Examples

- **Timeout**: "The request timed out. The server took too long to respond."
- **DNS Failure**: "Unable to resolve the domain name. Please check the URL."
- **404 Error**: "Request failed with client error (404). Resource not found."
- **Circuit Breaker**: "Too many recent failures for this domain. Temporarily blocking requests to protect the service."

### Security

Error messages are sanitized to prevent leaking:

- Internal file paths
- Stack traces
- Credentials or tokens
- Internal implementation details

## Logging

The server provides comprehensive logging for troubleshooting and monitoring.

### Log Categories

1. **Retry Events**

```
[Retry] Attempt 2/3 failed for https://example.com: SERVER_ERROR_5XX. Retrying in 2153ms...
[Retry] All 3 retries exhausted for https://example.com: SERVER_ERROR_5XX
```

2. **Circuit Breaker Events**

```
[CircuitBreaker] example.com: CLOSED -> OPEN (failures: 5)
[CircuitBreaker] Circuit OPEN for example.com, rejecting request
[CircuitBreaker] example.com: OPEN -> HALF_OPEN (failures: 5)
[CircuitBreaker] example.com: HALF_OPEN -> CLOSED (failures: 0)
```

3. **Fetch Errors**

```
[ProcessURL] Error fetching https://example.com: NETWORK_TIMEOUT - Request timed out
[FetchTool] Failed to fetch https://example.com: The request timed out
```

### Request Context

All logs include:

- URL being fetched
- Error code and type
- Retry attempt number
- Circuit breaker state
- Timestamps (via log output)

## Configuration Examples

### Conservative (Fewer retries, lower tolerance)

```bash
npx -y mcp-fetch-node \
  --retry-max-attempts 2 \
  --retry-initial-delay 2000 \
  --circuit-breaker-threshold 3 \
  --circuit-breaker-cooldown 120000 \
  --request-timeout 20000
```

### Aggressive (More retries, higher tolerance)

```bash
npx -y mcp-fetch-node \
  --retry-max-attempts 5 \
  --retry-initial-delay 500 \
  --retry-max-delay 15000 \
  --circuit-breaker-threshold 10 \
  --circuit-breaker-cooldown 30000 \
  --request-timeout 60000
```

### Production Recommended

```bash
npx -y mcp-fetch-node \
  --retry-max-attempts 3 \
  --retry-initial-delay 1000 \
  --retry-max-delay 10000 \
  --circuit-breaker-threshold 5 \
  --circuit-breaker-cooldown 60000 \
  --request-timeout 30000 \
  --concurrency 20 \
  --pool-connections 100
```

## Monitoring and Metrics

### Circuit Breaker Status

The circuit breaker maintains statistics for each domain:

```javascript
// Internal circuit stats (not exposed via API yet)
{
  state: 'OPEN',
  failures: 5,
  lastFailureTime: 1699999999999,
  halfOpenAttempts: 0,
  successCount: 0
}
```

### Request Queue Metrics

Monitor request queue health:

```javascript
{
  active: 10,   // Currently executing requests
  queued: 25,   // Waiting in queue
  depth: 35     // Total (active + queued)
}
```

## Best Practices

1. **Tune for Your Use Case**

   - Adjust timeouts based on expected response times
   - Set retry attempts based on service reliability
   - Configure circuit breaker threshold for failure tolerance

2. **Monitor Circuit Breaker Events**

   - Frequent OPEN states indicate upstream issues
   - Investigate domains that repeatedly trip circuits

3. **Handle Errors Gracefully**

   - Present user-friendly messages from error responses
   - Don't automatically retry on 4xx errors in client code
   - Log circuit breaker blocks for monitoring

4. **Resource Management**

   - Use appropriate timeouts to free resources
   - Configure connection pool size with concurrency
   - Balance retry attempts with system load

5. **Testing**
   - Test timeout behavior under slow networks
   - Verify circuit breaker opens under load
   - Validate retry backoff timing

## Troubleshooting

### Issue: Too many circuit breaker openings

**Symptoms**: Frequent `CIRCUIT_BREAKER_OPEN` errors

**Solutions**:

- Increase `--circuit-breaker-threshold` to tolerate more failures
- Increase `--circuit-breaker-cooldown` to give services more recovery time
- Investigate why the upstream service is failing

### Issue: Requests timing out frequently

**Symptoms**: Many `NETWORK_TIMEOUT` errors

**Solutions**:

- Increase `--request-timeout` for slower services
- Reduce `--concurrency` to avoid overloading the network
- Check if upstream services are slow to respond

### Issue: Too many retries wasting resources

**Symptoms**: High resource usage, slow responses

**Solutions**:

- Reduce `--retry-max-attempts`
- Increase `--retry-initial-delay` to space out retries
- Check if retrying is appropriate for your use case

### Issue: 4xx errors being retried

**Symptoms**: Client errors retried unnecessarily

**Note**: This should not happen as 4xx errors are non-retryable by design. If observed, this is a bug.

## Future Enhancements

Potential improvements to consider:

- [ ] Adaptive retry delays based on `Retry-After` headers
- [ ] Metrics endpoint for monitoring circuit breaker states
- [ ] Per-URL circuit breaker (more granular than per-domain)
- [ ] Configurable retry predicates for custom error handling
- [ ] Bulkhead pattern for resource isolation
- [ ] Rate limiting integration with circuit breaker
- [ ] Health check endpoints
- [ ] Structured logging with correlation IDs

## References

- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Building Resilient Services](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry)
