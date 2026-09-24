# Testing Documentation

This directory contains comprehensive tests for the Role Reactor Bot, covering unit tests, integration tests, and end-to-end workflows.

## 📁 Test Structure

```
tests/
├── README.md                 # This file
├── setup.js                  # Vitest setup and global mocks
├── api/                      # API configuration & endpoint tests
├── e2e/                      # End-to-end workflow tests
├── integration/              # Integration tests (Discord API, database, AI)
│   └── ai/                   # AI integration tests
├── security/                 # API security & auth tests
├── ticketing/                # Ticket system tests
├── utils/                    # Shared test utilities
│   └── rateLimit/            # Rate limit helpers
├── validation/               # Input validation tests
└── unit/                     # Unit tests for individual modules
    ├── commands/
    │   ├── admin/            # Admin command tests
    │   │   └── role-reactions/
    │   └── general/          # General command tests
    ├── config/               # Config tests
    │   └── prompts/
    ├── events/               # Event handler tests
    ├── features/             # Feature-specific tests
    │   ├── starboard/
    │   └── streaming/
    ├── server/               # API server tests
    │   └── controllers/
    ├── utils/                # Utility tests
    │   ├── ai/
    │   ├── core/
    │   ├── discord/
    │   ├── security/
    │   └── storage/
    └── webhooks/             # Webhook tests (topgg, crypto, BMAC)
```

## 🧪 Test Types

### Unit Tests (`tests/unit/`)

- **Purpose**: Test individual functions and modules in isolation
- **Coverage**: Command handlers, utilities, managers
- **Mocking**: Heavy use of mocks to isolate units
- **Speed**: Fast execution, no external dependencies

### Integration Tests (`tests/integration/`)

- **Purpose**: Test interactions with external APIs (Discord API)
- **Coverage**: API calls, authentication, error handling
- **Mocking**: Mock external services while testing real logic
- **Speed**: Medium execution time

### Security Tests (`tests/security/`)

- **Purpose**: Verify auth, rate limiting, and input validation on API routes

### End-to-End Tests (`tests/e2e/`)

- **Purpose**: Test complete user workflows and scenarios
- **Coverage**: Full user journeys from setup to cleanup
- **Mocking**: Minimal mocking, focus on real interactions
- **Speed**: Slower execution, comprehensive testing

## 🚀 Running Tests

### All Tests

```bash
pnpm test
```

### Specific Test Types

```bash
# Run specific test categories
pnpm test tests/unit/
pnpm test tests/integration/
pnpm test tests/security/
pnpm test tests/e2e/

# Run specific test subdirectories
pnpm test tests/unit/commands/
pnpm test tests/unit/events/
pnpm test tests/unit/utils/
pnpm test tests/unit/features/
```

### Development Mode

```bash
# Watch mode for development
pnpm test:watch

# CI mode (no watch, with coverage)
pnpm test:ci
```

## 📊 Current Test Coverage

### ✅ Covered (92 test files, 1588 tests)

**Unit Tests:**
- ✅ Admin Commands: welcome, goodbye, moderation, role-reactions, role-bundle, temp-roles, schedule-role, voice-roles, xp, ticket, giveaway, automod
- ✅ General Commands: help, level, leaderboard, poll, serverinfo, userinfo, rps, 8ball, wyr, avatar, balance, engine, premium, vote, ping, invite, support, chat, imagine
- ✅ Events: guildMemberUpdate, voiceStateUpdate, automod filters, role reaction workflows, unique selection
- ✅ Features: premium/Pro Engine, starboard, streaming, role scheduler, analytics gating
- ✅ Webhooks: topgg votes, crypto payments, Buy Me a Coffee
- ✅ Server controllers & notification tests

**Integration Tests:**
- ✅ Discord API integration
- ✅ Database operations
- ✅ AI integration

**Security Tests:**
- ✅ API security & auth
- ✅ Role bundles API

**API Tests:**
- ✅ API configuration & endpoint definitions

**E2E Tests:**
- ✅ Role management workflows

## 🛠️ Test Utilities

### Global Test Utilities (`tests/setup.js`)

The setup file provides global utilities for creating mock objects:

```javascript
// Create mock Discord interaction
const interaction = testUtils.createMockInteraction({
  commandName: "role-reactions",
  userId: "123456789012345678",
  guild: mockGuild,
});

// Create mock Discord guild
const guild = testUtils.createMockGuild({
  id: "guild123",
  name: "Test Guild",
  roles: [["role1", { id: "role1", name: "Developer" }]],
});

// Create mock Discord member
const member = testUtils.createMockMember({
  id: "member123",
  username: "TestUser",
  hasPermission: true,
});
```

### Available Mock Utilities

- `createMockInteraction()` - Discord slash command interactions
- `createMockGuild()` - Discord guild objects
- `createMockMember()` - Discord member objects
- `createMockMessage()` - Discord message objects
- `createMockReaction()` - Discord reaction objects
- `createMockClient()` - Discord.js client
- `wait(ms)` - Async wait utility

**Note**: These utilities create mock objects that simulate Discord.js behavior for testing purposes.

## 📝 Writing Tests

### Test File Structure

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("ModuleName", () => {
  let mockDependency;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("FunctionName", () => {
    test("should handle success case", async () => {
      const input = "test input";
      const result = await functionUnderTest(input);
      expect(result).toBe("expected result");
    });

    test("should handle error case", async () => {
      const input = "invalid input";
      await expect(functionUnderTest(input)).rejects.toThrow("Error message");
    });
  });
});
```

### Best Practices

1. **Descriptive Test Names**: Use clear, descriptive test names that explain the scenario
2. **Arrange-Act-Assert**: Structure tests with clear sections
3. **Isolation**: Each test should be independent and not rely on other tests
4. **Mocking**: Mock external dependencies to isolate the unit under test
5. **Error Testing**: Always test both success and error scenarios
6. **Async Testing**: Use proper async/await patterns for asynchronous code

### Mocking Guidelines

```javascript
// Mock modules (adjust path depth based on test location)
// For tests in tests/unit/commands/*/: use ../../../../src/
// For tests in tests/unit/utils/*/: use ../../../src/
vi.mock("../../../src/utils/logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock functions
const mockFunction = vi.fn().mockResolvedValue("result");

// Mock Discord objects
const mockInteraction = {
  commandName: "test-command",
  reply: vi.fn(),
  options: {
    getString: vi.fn().mockReturnValue("test"),
  },
};
```

## 🔧 Configuration

### Vitest Configuration (`vitest.config.js`)

- **Environment**: Node.js
- **Coverage**: Enabled with thresholds
- **Timeout**: 10 seconds per test
- **ES Modules**: Full support for ES modules
- **Mocking**: Automatic mock clearing between tests

### Environment Variables

Test environment variables are set in `tests/setup.js`:

```javascript
process.env.NODE_ENV = "test";
process.env.DISCORD_TOKEN = "test-token";
process.env.MONGODB_URI = "mongodb://localhost:27017/test";
process.env.PORT = "3001";
```

## 🐛 Debugging Tests

### Running Specific Tests

```bash
# Run tests matching a pattern
pnpm test --testNamePattern="should handle error"

# Run tests in a specific file
pnpm test tests/unit/utils/core/commandHandler.test.js

# Run tests with verbose output
pnpm test --verbose
```

### Debug Mode

```bash
# Run tests with Node.js debugger
node --inspect-brk node_modules/.bin/vitest --run

# Run specific test with debugging
NODE_OPTIONS='--inspect-brk' pnpm test tests/unit/commandHandler.test.js
```
