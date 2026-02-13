# Soulseek Service Tests

## Running Tests

```bash
# All soulseek tests
npm test -- soulseek

# Specific test file
npm test -- soulseek.test.ts

# Watch mode
npm test -- soulseek --watch

# Coverage
npm test -- soulseek --coverage
```

## Test Structure

- `soulseek.test.ts` - Main service tests (circuit breaker, retry, dedup)
- `client.test.ts` - SlskClient tests (download cleanup, memory leaks)

## Mocking Strategy

Tests use Jest mocks and spies to isolate units:
- Mock `SlskClient` for service tests
- Mock file system for download tests
- Use `jest.useFakeTimers()` for timeout/TTL tests

## Coverage Goals

- Circuit breaker: 100%
- Error categorization: 100%
- Download retry flow: 90%+
- Memory cleanup: 100%

## Integration Testing

For full integration tests with real Soulseek network:
1. Use test account credentials
2. Run in isolated environment (not production)
3. Expect variability in results (P2P network)

## Known Test Limitations

- Cannot test actual TCP socket behavior (vendored library)
- Network timing may vary in CI/CD
- Some edge cases require manual testing with real network
