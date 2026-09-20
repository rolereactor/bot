import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createMockInteraction,
  createMockClient,
  setupCommonMocks,
} from "../../../utils/testHelpers.js";

setupCommonMocks();

vi.mock("src/config/theme.js", () => ({
  THEME: { PRIMARY: 0x5865f2, ERROR: 0xed4245 },
  EMOJIS: {},
}));

vi.mock("src/config/emojis.js", () => ({
  emojiConfig: { customEmojis: { core: "⚡" } },
}));

vi.mock("src/utils/discord/responseMessages.js", () => ({
  errorEmbed: vi.fn(opts => ({ embeds: [{ data: opts }] })),
  successEmbed: vi.fn(opts => ({ embeds: [{ data: opts }] })),
}));

vi.mock("src/config/config.js", () => ({
  config: { externalLinks: { website: "https://rolereactor.xyz" } },
  default: { externalLinks: { website: "https://rolereactor.xyz" } },
}));

vi.mock("src/commands/general/balance/embeds.js", () => ({
  createBalanceEmbed: vi.fn().mockReturnValue({ embeds: [{ data: { title: "Balance" } }], components: [] }),
  createErrorEmbed: vi.fn().mockReturnValue({ data: { title: "Error" } }),
  createValidationErrorEmbed: vi.fn().mockReturnValue({ data: { title: "Validation Error" } }),
}));

vi.mock("src/commands/general/balance/utils.js", () => ({
  getUserData: vi.fn().mockResolvedValue({ credits: 10, userId: "user123" }),
  handleCoreError: vi.fn(),
  logOperationDuration: vi.fn(),
  createPerformanceContext: vi.fn().mockReturnValue({
    startTime: Date.now(),
    userId: "user123",
    username: "TestUser",
  }),
}));

// All validations pass by default — individual tests override via the mock directly
vi.mock("src/commands/general/balance/validation.js", () => ({
  validateCoreCommandInputs: vi.fn().mockReturnValue({
    valid: true,
    data: { subcommand: "balance" },
  }),
  validateBalanceInputs: vi.fn().mockReturnValue({ valid: true }),
  validateInteractionState: vi.fn().mockReturnValue({ valid: true }),
  validateCommandPermissions: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock("src/utils/storage/databaseManager.js", () => ({
  getDatabaseManager: vi.fn().mockResolvedValue({
    coreCredits: {
      getByUser: vi.fn().mockResolvedValue({ credits: 10 }),
    },
  }),
}));

import { execute } from "../../../../src/commands/general/balance/handlers.js";

describe("Core Command", () => {
  let mockInteraction;
  let mockClient;

  beforeEach(() => {
    vi.clearAllMocks();

    mockClient = createMockClient({
      user: {
        id: "bot123",
        tag: "TestBot#1234",
        username: "TestBot",
        displayAvatarURL: vi.fn().mockReturnValue("https://example.com/bot.png"),
      },
    });

    mockInteraction = createMockInteraction({
      client: mockClient,
      options: {
        getSubcommand: vi.fn().mockReturnValue("balance"),
        getString: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
        getBoolean: vi.fn().mockReturnValue(null),
        getUser: vi.fn().mockReturnValue(null),
        getRole: vi.fn().mockReturnValue(null),
        getChannel: vi.fn().mockReturnValue(null),
      },
      isRepliable: vi.fn().mockReturnValue(true),
      isChatInputCommand: vi.fn().mockReturnValue(true),
      isCommand: vi.fn().mockReturnValue(true),
      deferReply: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      reply: vi.fn().mockResolvedValue(undefined),
      channel: {
        id: "channel123",
        name: "test-channel",
        type: 0,
        send: vi.fn().mockResolvedValue({}),
        createMessageComponentCollector: vi.fn().mockReturnValue({
          on: vi.fn(),
          stop: vi.fn(),
        }),
      },
    });
  });

  describe("execute", () => {
    it("should not throw when called with a valid interaction", async () => {
      await expect(
        execute(mockInteraction, mockClient),
      ).resolves.not.toThrow();
    });

    it("should attempt to defer reply during execution", async () => {
      await execute(mockInteraction, mockClient);

      // Either deferReply was called (happy path) or reply was called (error path)
      // — at minimum one of them must respond to the user
      const responded =
        mockInteraction.deferReply.mock.calls.length > 0 ||
        mockInteraction.reply.mock.calls.length > 0;
      expect(responded).toBe(true);
    });

    it("should send a response after processing", async () => {
      await execute(mockInteraction, mockClient);

      const replied =
        mockInteraction.reply.mock.calls.length > 0 ||
        mockInteraction.editReply.mock.calls.length > 0;
      expect(replied).toBe(true);
    });

    it("should handle interaction errors gracefully", async () => {
      mockInteraction.deferReply.mockRejectedValue(new Error("Interaction expired"));

      await expect(
        execute(mockInteraction, mockClient),
      ).resolves.not.toThrow();
    });
  });
});
