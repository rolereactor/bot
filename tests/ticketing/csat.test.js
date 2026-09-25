import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/features/ticketing/TicketManager.js", () => ({
  getTicketManager: () => mocks.ticketManager,
}));

vi.mock("../../src/utils/storage/storageManager.js", () => ({
  getStorageManager: () => mocks.storageManager,
}));

const mocks = vi.hoisted(() => ({
  ticketManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getTicket: vi.fn(),
    storage: {
      setTicketFeedback: vi.fn().mockResolvedValue(true),
      dbManager: {
        guildSettings: {
          getByGuild: vi.fn().mockResolvedValue(null),
        },
      },
    },
  },
  storageManager: {
    dbManager: {
      guildSettings: {
        getByGuild: vi.fn().mockResolvedValue(null),
      },
    },
  },
  client: null,
}));

import {
  isCsatEnabled,
  createCsatButtons,
  createCsatCommentButton,
  promptCsatOnClose,
} from "../../src/features/ticketing/csat.js";
import { TicketRepository } from "../../src/utils/storage/repositories/TicketRepository.js";
import { handleCsatRating } from "../../src/events/ticketing/handlers/ticketCsat.js";

function makeInteraction(customId, overrides = {}) {
  return {
    customId,
    user: { id: "111", tag: "user#0001" },
    client: {},
    replied: false,
    deferred: false,
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeTicket(overrides = {}) {
  return {
    ticketId: "TIX-999-0042",
    guildId: "999",
    userId: "111",
    status: "closed",
    claimedBy: "222",
    closedBy: "333",
    categoryId: "support",
    metadata: { feedbackRating: null, feedbackComment: null },
    ...overrides,
  };
}

describe("CSAT helpers", () => {
  it("isCsatEnabled defaults to enabled", () => {
    expect(isCsatEnabled(null)).toBe(true);
    expect(isCsatEnabled({})).toBe(true);
    expect(isCsatEnabled({ ticketSettings: {} })).toBe(true);
    expect(isCsatEnabled({ ticketSettings: { csatEnabled: true } })).toBe(true);
  });

  it("isCsatEnabled respects explicit opt-out", () => {
    expect(isCsatEnabled({ ticketSettings: { csatEnabled: false } })).toBe(
      false,
    );
  });

  it("createCsatButtons builds 5 star buttons with correct customIds", () => {
    const row = createCsatButtons("TIX-999-0042");
    expect(row.components).toHaveLength(5);
    const ids = row.components.map(b => b.data.custom_id);
    expect(ids).toEqual([
      "ticket_csat:TIX-999-0042:1",
      "ticket_csat:TIX-999-0042:2",
      "ticket_csat:TIX-999-0042:3",
      "ticket_csat:TIX-999-0042:4",
      "ticket_csat:TIX-999-0042:5",
    ]);
  });

  it("createCsatCommentButton uses the comment customId", () => {
    const row = createCsatCommentButton("TIX-999-0042");
    expect(row.components[0].data.custom_id).toBe(
      "ticket_csat_comment:TIX-999-0042",
    );
  });
});

describe("promptCsatOnClose", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.storageManager.dbManager.guildSettings.getByGuild.mockResolvedValue(
      null,
    );
  });

  it("skips when CSAT is disabled for the guild", async () => {
    mocks.storageManager.dbManager.guildSettings.getByGuild.mockResolvedValue({
      ticketSettings: { csatEnabled: false },
    });
    const user = { send: vi.fn() };
    const client = { users: { fetch: vi.fn().mockResolvedValue(user) } };

    const result = await promptCsatOnClose({
      client,
      guildId: "999",
      ticket: makeTicket(),
    });

    expect(result).toBe(false);
    expect(user.send).not.toHaveBeenCalled();
  });

  it("sends the star prompt DM when enabled", async () => {
    const user = { send: vi.fn().mockResolvedValue(undefined) };
    const client = { users: { fetch: vi.fn().mockResolvedValue(user) } };

    const result = await promptCsatOnClose({
      client,
      guildId: "999",
      ticket: makeTicket(),
    });

    expect(result).toBe(true);
    expect(user.send).toHaveBeenCalledTimes(1);
    const payload = user.send.mock.calls[0][0];
    expect(payload.components[0].components).toHaveLength(5);
  });

  it("returns false silently when DMs are closed", async () => {
    const client = {
      users: {
        fetch: vi.fn().mockResolvedValue({
          send: vi.fn().mockRejectedValue(new Error("Cannot send messages")),
        }),
      },
    };

    const result = await promptCsatOnClose({
      client,
      guildId: "999",
      ticket: makeTicket(),
    });

    expect(result).toBe(false);
  });
});

describe("TicketRepository.setFeedback", () => {
  let repo;
  let updateOne;

  beforeEach(() => {
    updateOne = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const collection = {
      createIndex: vi.fn().mockResolvedValue(undefined),
      updateOne,
      findOne: vi.fn(),
    };
    const db = { collection: () => collection };
    const logger = { debug: vi.fn(), error: vi.fn() };
    repo = new TicketRepository(db, {}, logger);
  });

  it("saves a rating with staff attribution", async () => {
    const ok = await repo.setFeedback("TIX-1", {
      rating: 4,
      ratedStaffId: "222",
    });

    expect(ok).toBe(true);
    const [query, update] = updateOne.mock.calls[0];
    expect(query).toEqual({ ticketId: "TIX-1" });
    expect(update.$set["metadata.feedbackRating"]).toBe(4);
    expect(update.$set["metadata.ratedStaffId"]).toBe("222");
    expect(update.$set.updatedAt).toBeDefined();
  });

  it("saves a comment without touching the rating", async () => {
    await repo.setFeedback("TIX-1", { comment: "Great help!" });

    const [, update] = updateOne.mock.calls[0];
    expect(update.$set["metadata.feedbackComment"]).toBe("Great help!");
    expect(update.$set["metadata.feedbackRating"]).toBeUndefined();
  });

  it("returns false when the ticket does not exist", async () => {
    updateOne.mockResolvedValue({ matchedCount: 0 });
    const ok = await repo.setFeedback("TIX-missing", { rating: 3 });
    expect(ok).toBe(false);
  });

  it("returns false on repository error", async () => {
    updateOne.mockRejectedValue(new Error("db down"));
    const ok = await repo.setFeedback("TIX-1", { rating: 3 });
    expect(ok).toBe(false);
  });
});

describe("handleCsatRating guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ticketManager.initialize.mockResolvedValue(undefined);
    mocks.ticketManager.storage.setTicketFeedback.mockResolvedValue(true);
    mocks.ticketManager.storage.dbManager.guildSettings.getByGuild.mockResolvedValue(
      null,
    );
  });

  it("rejects an invalid rating value", async () => {
    mocks.ticketManager.getTicket.mockResolvedValue(makeTicket());
    const interaction = makeInteraction("ticket_csat:TIX-999-0042:9");

    await handleCsatRating(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
    expect(
      mocks.ticketManager.storage.setTicketFeedback,
    ).not.toHaveBeenCalled();
  });

  it("rejects ratings from non-openers", async () => {
    mocks.ticketManager.getTicket.mockResolvedValue(makeTicket());
    const interaction = makeInteraction("ticket_csat:TIX-999-0042:5", {
      user: { id: "777", tag: "other#0001" },
    });

    await handleCsatRating(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(
      mocks.ticketManager.storage.setTicketFeedback,
    ).not.toHaveBeenCalled();
  });

  it("rejects ratings on tickets that are still open", async () => {
    mocks.ticketManager.getTicket.mockResolvedValue(
      makeTicket({ status: "open" }),
    );
    const interaction = makeInteraction("ticket_csat:TIX-999-0042:5");

    await handleCsatRating(interaction);

    expect(interaction.reply).toHaveBeenCalled();
    expect(
      mocks.ticketManager.storage.setTicketFeedback,
    ).not.toHaveBeenCalled();
  });

  it("saves the rating and credits the claimer", async () => {
    mocks.ticketManager.getTicket.mockResolvedValue(makeTicket());
    const interaction = makeInteraction("ticket_csat:TIX-999-0042:4");

    await handleCsatRating(interaction);

    expect(
      mocks.ticketManager.storage.setTicketFeedback,
    ).toHaveBeenCalledWith("TIX-999-0042", {
      rating: 4,
      ratedStaffId: "222",
    });
    expect(interaction.update).toHaveBeenCalledTimes(1);
  });

  it("falls back to the closer when the ticket was never claimed", async () => {
    mocks.ticketManager.getTicket.mockResolvedValue(
      makeTicket({ claimedBy: null, closedBy: "333" }),
    );
    const interaction = makeInteraction("ticket_csat:TIX-999-0042:2");

    await handleCsatRating(interaction);

    expect(
      mocks.ticketManager.storage.setTicketFeedback,
    ).toHaveBeenCalledWith("TIX-999-0042", {
      rating: 2,
      ratedStaffId: "333",
    });
  });
});
