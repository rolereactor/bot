import { describe, test, expect, beforeEach } from "vitest";

/**
 * Real-world workflow tests for role reaction modes.
 *
 * Models the exact role configuration from the user's Discord server:
 * - 😀 → [@Member, @Sponser, @Coder, @Artist] (4 roles)
 * - 😇 → [@Gamer, @Coder, @Ticket Team, @Artist, @Member, @Sponser, @Mute, @Moderator, @Admin] (9 roles)
 * - Shared: @Member, @Sponser, @Coder, @Artist
 * - Unique to 😀: none (all shared)
 * - Unique to 😇: @Gamer, @Ticket Team, @Mute, @Moderator, @Admin
 */

// ─── Simulated role mapping (matches actual DB structure) ──────────────
const ROLE_IDS = {
  MEMBER: "role-member",
  SPONSER: "role-sponsor",
  CODER: "role-coder",
  ARTIST: "role-artist",
  GAMER: "role-gamer",
  TICKET_TEAM: "role-ticket-team",
  MUTE: "role-mute",
  MODERATOR: "role-moderator",
  ADMIN: "role-admin",
};

const EMOJI_ROLES = {
  "😀": [
    ROLE_IDS.MEMBER,
    ROLE_IDS.SPONSER,
    ROLE_IDS.CODER,
    ROLE_IDS.ARTIST,
  ],
  "😇": [
    ROLE_IDS.GAMER,
    ROLE_IDS.CODER,
    ROLE_IDS.TICKET_TEAM,
    ROLE_IDS.ARTIST,
    ROLE_IDS.MEMBER,
    ROLE_IDS.SPONSER,
    ROLE_IDS.MUTE,
    ROLE_IDS.MODERATOR,
    ROLE_IDS.ADMIN,
  ],
};

const STANDARD_ROLES_OBJ = {
  hideList: false,
  ...EMOJI_ROLES,
};

const UNIQUE_ROLES_OBJ = {
  selectionMode: "unique",
  hideList: false,
  ...EMOJI_ROLES,
};

// ─── Simulate messageReactionAdd handler logic ─────────────────────────
function simulateAddHandler(rolesObj, clickedEmoji, memberRoles) {
  const selectionMode = rolesObj.selectionMode || "standard";
  const newRoleIds = rolesObj[clickedEmoji] || [];
  const logs = [];

  if (selectionMode === "unique") {
    const newEmojiRoleIds = new Set(newRoleIds);

    for (const [emojiKey, roleIds] of Object.entries(rolesObj)) {
      if (["hideList", "selectionMode", "roles"].includes(emojiKey)) continue;
      if (typeof roleIds === "boolean" || roleIds == null) continue;
      if (emojiKey === clickedEmoji) continue;

      // Only remove roles NOT in the new emoji's list
      const toRemove = roleIds.filter(
        (id) => memberRoles.has(id) && !newEmojiRoleIds.has(id)
      );
      for (const id of toRemove) {
        memberRoles.delete(id);
        logs.push(`unique:removed:${id}`);
      }
    }
  }

  // Add new roles
  const added = [];
  for (const id of newRoleIds) {
    if (!memberRoles.has(id)) {
      memberRoles.add(id);
      added.push(id);
      logs.push(`assigned:${id}`);
    }
  }

  return { memberRoles, logs, added };
}

// ─── Simulate messageReactionRemove handler logic ──────────────────────
function simulateRemoveHandler(rolesObj, removedEmoji, memberRoles, userReactions) {
  const roleIds = rolesObj[removedEmoji] || [];
  const selectionMode = rolesObj.selectionMode || "standard";
  const logs = [];

  let roleIdsToRemove = roleIds;

  if (selectionMode === "unique") {
    const otherEmojisRoles = [];
    for (const [emojiKey, ids] of Object.entries(rolesObj)) {
      if (["hideList", "selectionMode", "roles"].includes(emojiKey)) continue;
      if (typeof ids === "boolean" || ids == null) continue;
      if (emojiKey === removedEmoji) continue;
      if (userReactions.has(emojiKey)) {
        otherEmojisRoles.push(...ids);
      }
    }
    roleIdsToRemove = roleIds.filter((id) => !otherEmojisRoles.includes(id));
  }

  const removed = [];
  for (const id of roleIdsToRemove) {
    if (memberRoles.has(id)) {
      memberRoles.delete(id);
      removed.push(id);
      logs.push(`removed:${id}`);
    }
  }

  return { memberRoles, logs, removed };
}

// ═══════════════════════════════════════════════════════════════════════
// STANDARD MODE WORKFLOWS
// ═══════════════════════════════════════════════════════════════════════
describe("Standard Mode Workflows", () => {
  test("Workflow 1: No roles → click 😀 → roles assigned", () => {
    const memberRoles = new Set();
    const { logs, added } = simulateAddHandler(STANDARD_ROLES_OBJ, "😀", memberRoles);

    expect(added).toHaveLength(4);
    expect(memberRoles).toEqual(
      new Set([
        ROLE_IDS.MEMBER,
        ROLE_IDS.SPONSER,
        ROLE_IDS.CODER,
        ROLE_IDS.ARTIST,
      ])
    );
  });

  test("Workflow 2: Has 😀 roles → click 😇 → both emojis' roles kept", () => {
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
    ]);

    const { added } = simulateAddHandler(STANDARD_ROLES_OBJ, "😇", memberRoles);

    // Standard mode ADDS roles, never removes
    expect(added).toHaveLength(5); // 5 new roles from 😇
    expect(memberRoles.size).toBe(9); // all 9 roles
    expect(memberRoles).toContain(ROLE_IDS.GAMER);
    expect(memberRoles).toContain(ROLE_IDS.MEMBER); // shared, kept
  });

  test("Workflow 3: Has roles → unreact 😀 → only 😀 roles removed", () => {
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
    ]);

    const { removed } = simulateRemoveHandler(
      STANDARD_ROLES_OBJ,
      "😀",
      memberRoles,
      new Set() // no other reactions
    );

    expect(removed).toHaveLength(4);
    expect(memberRoles.size).toBe(0);
  });

  test("Workflow 4: Has both emojis' roles → unreact 😀 → only 😀 roles removed", () => {
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
      ROLE_IDS.GAMER,
      ROLE_IDS.TICKET_TEAM,
      ROLE_IDS.MUTE,
      ROLE_IDS.MODERATOR,
      ROLE_IDS.ADMIN,
    ]);

    const { removed } = simulateRemoveHandler(
      STANDARD_ROLES_OBJ,
      "😀",
      memberRoles,
      new Set(["😇"]) // still has 😇 reaction
    );

    // Standard mode removes ALL roles for the emoji, regardless of other reactions
    expect(removed).toHaveLength(4);
    // 😇's unique roles remain
    expect(memberRoles).toContain(ROLE_IDS.GAMER);
    expect(memberRoles).toContain(ROLE_IDS.ADMIN);
    expect(memberRoles.size).toBe(5);
  });

  test("Workflow 5: Click 😀 twice → no duplicate roles", () => {
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
    ]);

    const { added } = simulateAddHandler(STANDARD_ROLES_OBJ, "😀", memberRoles);

    // Already has all 4 roles, nothing new added
    expect(added).toHaveLength(0);
    expect(memberRoles.size).toBe(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// UNIQUE MODE WORKFLOWS (the critical ones)
// ═══════════════════════════════════════════════════════════════════════
describe("Unique Mode Workflows", () => {
  test("Workflow 1: No roles → click 😀 → 4 roles assigned", () => {
    const memberRoles = new Set();
    const { added } = simulateAddHandler(UNIQUE_ROLES_OBJ, "😀", memberRoles);

    expect(added).toHaveLength(4);
    expect(memberRoles).toEqual(
      new Set([
        ROLE_IDS.MEMBER,
        ROLE_IDS.SPONSER,
        ROLE_IDS.CODER,
        ROLE_IDS.ARTIST,
      ])
    );
  });

  test("Workflow 2: Has 😀 roles → click 😇 → shared roles preserved, unique roles switched", () => {
    // Start with 😀 roles
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
    ]);

    const { added, logs } = simulateAddHandler(UNIQUE_ROLES_OBJ, "😇", memberRoles);

    // Should add 5 roles unique to 😇 (gamer, ticket, mute, moderator, admin)
    expect(added).toHaveLength(5);

    // Shared roles (member, sponsor, coder, artist) should NOT be removed
    const removedLogs = logs.filter((l) => l.startsWith("unique:removed:"));
    expect(removedLogs).toHaveLength(0); // no unique:removed logs

    // All 9 roles should be present
    expect(memberRoles.size).toBe(9);
    expect(memberRoles).toContain(ROLE_IDS.MEMBER); // shared, preserved
    expect(memberRoles).toContain(ROLE_IDS.GAMER); // unique to 😇, added
    expect(memberRoles).toContain(ROLE_IDS.ADMIN); // unique to 😇, added
  });

  test("Workflow 3: Has 😇 roles → click 😀 → only 😇-unique roles removed, shared preserved", () => {
    // Start with ALL 9 😇 roles
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
      ROLE_IDS.GAMER,
      ROLE_IDS.TICKET_TEAM,
      ROLE_IDS.MUTE,
      ROLE_IDS.MODERATOR,
      ROLE_IDS.ADMIN,
    ]);

    const { added, logs } = simulateAddHandler(UNIQUE_ROLES_OBJ, "😀", memberRoles);

    // 😀 has no new roles to add (all 4 are already present as shared)
    expect(added).toHaveLength(0);

    // Should remove 5 roles unique to 😇
    const removedLogs = logs.filter((l) => l.startsWith("unique:removed:"));
    expect(removedLogs).toHaveLength(5);

    // Final state: only 😀's 4 roles remain
    expect(memberRoles.size).toBe(4);
    expect(memberRoles).toEqual(
      new Set([
        ROLE_IDS.MEMBER,
        ROLE_IDS.SPONSER,
        ROLE_IDS.CODER,
        ROLE_IDS.ARTIST,
      ])
    );
  });

  test("Workflow 4: Switch 😀→😇→😀 → roles follow correctly", () => {
    const memberRoles = new Set();

    // Step 1: Click 😀
    simulateAddHandler(UNIQUE_ROLES_OBJ, "😀", memberRoles);
    expect(memberRoles.size).toBe(4);

    // Step 2: Click 😇 (switch from 😀)
    simulateAddHandler(UNIQUE_ROLES_OBJ, "😇", memberRoles);
    // Shared roles preserved, 😇-unique added
    expect(memberRoles.size).toBe(9);
    expect(memberRoles).toContain(ROLE_IDS.GAMER);

    // Step 3: Click 😀 (switch back from 😇)
    simulateAddHandler(UNIQUE_ROLES_OBJ, "😀", memberRoles);
    // 😇-unique roles removed, shared preserved
    expect(memberRoles.size).toBe(4);
    expect(memberRoles).not.toContain(ROLE_IDS.GAMER);
    expect(memberRoles).not.toContain(ROLE_IDS.ADMIN);
    expect(memberRoles).toContain(ROLE_IDS.MEMBER); // shared, preserved
  });

  test("Workflow 5: Has 😇 roles → unreact 😇 (no other reactions) → all 😇 roles removed", () => {
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
      ROLE_IDS.GAMER,
      ROLE_IDS.TICKET_TEAM,
      ROLE_IDS.MUTE,
      ROLE_IDS.MODERATOR,
      ROLE_IDS.ADMIN,
    ]);

    const { removed } = simulateRemoveHandler(
      UNIQUE_ROLES_OBJ,
      "😇",
      memberRoles,
      new Set() // no other reactions
    );

    // All 9 roles removed (no other emoji to protect shared ones)
    expect(removed).toHaveLength(9);
    expect(memberRoles.size).toBe(0);
  });

  test("Workflow 6: Has 😇 roles → unreact 😇 (still has 😀) → only 😇-unique removed", () => {
    const memberRoles = new Set([
      ROLE_IDS.MEMBER,
      ROLE_IDS.SPONSER,
      ROLE_IDS.CODER,
      ROLE_IDS.ARTIST,
      ROLE_IDS.GAMER,
      ROLE_IDS.TICKET_TEAM,
      ROLE_IDS.MUTE,
      ROLE_IDS.MODERATOR,
      ROLE_IDS.ADMIN,
    ]);

    const { removed } = simulateRemoveHandler(
      UNIQUE_ROLES_OBJ,
      "😇",
      memberRoles,
      new Set(["😀"]) // still has 😀 reaction
    );

    // Only 5 roles unique to 😇 removed (shared protected by 😀)
    expect(removed).toHaveLength(5);
    expect(memberRoles.size).toBe(4);
    expect(memberRoles).toContain(ROLE_IDS.MEMBER); // shared, preserved
    expect(memberRoles).toContain(ROLE_IDS.CODER); // shared, preserved
    expect(memberRoles).not.toContain(ROLE_IDS.GAMER); // unique to 😇, removed
    expect(memberRoles).not.toContain(ROLE_IDS.ADMIN); // unique to 😇, removed
  });

  test("Workflow 7: Rapid switching 😀→😇→😀→😇 → no role loss", () => {
    const memberRoles = new Set();

    // Rapid sequence
    simulateAddHandler(UNIQUE_ROLES_OBJ, "😀", memberRoles);
    expect(memberRoles.size).toBe(4);

    simulateAddHandler(UNIQUE_ROLES_OBJ, "😇", memberRoles);
    expect(memberRoles.size).toBe(9);

    simulateAddHandler(UNIQUE_ROLES_OBJ, "😀", memberRoles);
    expect(memberRoles.size).toBe(4);

    simulateAddHandler(UNIQUE_ROLES_OBJ, "😇", memberRoles);
    expect(memberRoles.size).toBe(9);

    // Final state: all 😇 roles present
    expect(memberRoles).toContain(ROLE_IDS.GAMER);
    expect(memberRoles).toContain(ROLE_IDS.ADMIN);
    expect(memberRoles).toContain(ROLE_IDS.MEMBER); // shared
  });

  test("Workflow 8: Partial roles → click different emoji → correct handling", () => {
    // User only has 2 of 😀's roles (maybe others were removed by admin)
    const memberRoles = new Set([ROLE_IDS.MEMBER, ROLE_IDS.CODER]);

    const { added, logs } = simulateAddHandler(UNIQUE_ROLES_OBJ, "😇", memberRoles);

    // Should add 7 new roles (9 total minus 2 already present)
    expect(added).toHaveLength(7);

    // No roles should be removed (only had shared roles)
    const removedLogs = logs.filter((l) => l.startsWith("unique:removed:"));
    expect(removedLogs).toHaveLength(0);

    // All 9 roles present
    expect(memberRoles.size).toBe(9);
  });

  test("Workflow 9: Single-role emojis → unique mode works correctly", () => {
    const singleRoleObj = {
      selectionMode: "unique",
      "🔴": ["role-red"],
      "🔵": ["role-blue"],
      "🟢": ["role-green"],
    };

    const memberRoles = new Set(["role-red"]);

    // Click 🔵
    simulateAddHandler(singleRoleObj, "🔵", memberRoles);
    expect(memberRoles).toEqual(new Set(["role-blue"]));

    // Click 🟢
    simulateAddHandler(singleRoleObj, "🟢", memberRoles);
    expect(memberRoles).toEqual(new Set(["role-green"]));
  });
});

// ═══════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═══════════════════════════════════════════════════════════════════════
describe("Edge Cases", () => {
  test("Click emoji with no roles configured → no changes", () => {
    const memberRoles = new Set([ROLE_IDS.MEMBER]);
    const { added } = simulateAddHandler(STANDARD_ROLES_OBJ, "❓", memberRoles);

    expect(added).toHaveLength(0);
    expect(memberRoles).toEqual(new Set([ROLE_IDS.MEMBER]));
  });

  test("Unreact emoji not in mapping → no changes", () => {
    const memberRoles = new Set([ROLE_IDS.MEMBER]);
    const { removed } = simulateRemoveHandler(
      STANDARD_ROLES_OBJ,
      "❓",
      memberRoles,
      new Set()
    );

    expect(removed).toHaveLength(0);
    expect(memberRoles).toEqual(new Set([ROLE_IDS.MEMBER]));
  });

  test("User has no roles → unreact → nothing to remove", () => {
    const memberRoles = new Set();
    const { removed } = simulateRemoveHandler(
      STANDARD_ROLES_OBJ,
      "😀",
      memberRoles,
      new Set()
    );

    expect(removed).toHaveLength(0);
  });
});
