import { describe, test, expect } from "vitest";

/**
 * Unit tests for Unique selection mode in role reactions.
 *
 * Unique mode: when a user reacts to one emoji, all roles from OTHER emojis
 * in the same menu are removed, and only the new emoji's roles are kept.
 */

// Simulate the role resolution logic from messageReactionAdd.js
function resolveRoleIds(config) {
  if (config.roleIds && Array.isArray(config.roleIds)) return config.roleIds;
  if (config.roleId) return [config.roleId];
  if (typeof config === "string") return [config];
  return [];
}

// Simulate the unique mode removal logic
function getRolesToRemove(rolesObj, currentEmoji, memberRoles) {
  const removeOps = [];

  for (const [emojiKey, config] of Object.entries(rolesObj)) {
    if (["hideList", "selectionMode", "roles"].includes(emojiKey)) continue;
    if (typeof config === "boolean" || config == null) continue;
    if (emojiKey === currentEmoji) continue;

    const otherRoleIds = resolveRoleIds(config);
    const rolesToRemove = otherRoleIds.filter((id) => memberRoles.has(id));

    if (rolesToRemove.length > 0) {
      removeOps.push({ emoji: emojiKey, roles: rolesToRemove });
    }
  }

  return removeOps;
}

describe("Unique Selection Mode", () => {
  const rolesObj = {
    selectionMode: "unique",
    hideList: false,
    "😀": {
      roleIds: ["role-member", "role-sponsor", "role-coder", "role-artist"],
    },
    "😎": {
      roleIds: [
        "role-gamer",
        "role-coder",
        "role-ticket-team",
        "role-artist",
        "role-member",
        "role-sponsor",
        "role-mute",
        "role-moderator",
        "role-admin",
      ],
    },
  };

  test("removes all roles from other emoji when switching", () => {
    // User has roles from 😀
    const memberRoles = new Set([
      "role-member",
      "role-sponsor",
      "role-coder",
      "role-artist",
    ]);

    // User reacts to 😎
    const removeOps = getRolesToRemove(rolesObj, "😎", memberRoles);

    expect(removeOps).toHaveLength(1);
    expect(removeOps[0].emoji).toBe("😀");
    expect(removeOps[0].roles).toEqual(
      expect.arrayContaining([
        "role-member",
        "role-sponsor",
        "role-coder",
        "role-artist",
      ])
    );
  });

  test("does not remove roles from the current emoji", () => {
    // User has ONLY roles from 😎 (no overlap with 😀)
    const memberRoles = new Set([
      "role-gamer",
      "role-ticket-team",
      "role-mute",
      "role-moderator",
      "role-admin",
    ]);

    // User reacts to 😎 again (no-op)
    const removeOps = getRolesToRemove(rolesObj, "😎", memberRoles);

    // User doesn't have any 😀 roles, so nothing to remove
    expect(removeOps).toHaveLength(0);
  });

  test("handles overlapping roles between emojis", () => {
    // User has roles from 😀 (some overlap with 😎)
    const memberRoles = new Set([
      "role-member",
      "role-sponsor",
      "role-coder",
      "role-artist",
    ]);

    // User reacts to 😎
    const removeOps = getRolesToRemove(rolesObj, "😎", memberRoles);

    // Should remove all 4 roles from 😀
    expect(removeOps).toHaveLength(1);
    expect(removeOps[0].roles).toHaveLength(4);
  });

  test("only removes roles the member actually has", () => {
    // User only has 2 of the 4 😀 roles
    const memberRoles = new Set(["role-member", "role-coder"]);

    // User reacts to 😎
    const removeOps = getRolesToRemove(rolesObj, "😎", memberRoles);

    expect(removeOps).toHaveLength(1);
    expect(removeOps[0].roles).toEqual(["role-member", "role-coder"]);
  });

  test("handles single-role emojis", () => {
    const singleRoleObj = {
      selectionMode: "unique",
      "🔴": { roleId: "role-red" },
      "🔵": { roleId: "role-blue" },
      "🟢": { roleId: "role-green" },
    };

    // User has 🔴 role, reacts to 🔵
    const memberRoles = new Set(["role-red"]);
    const removeOps = getRolesToRemove(singleRoleObj, "🔵", memberRoles);

    expect(removeOps).toHaveLength(1);
    expect(removeOps[0].emoji).toBe("🔴");
    expect(removeOps[0].roles).toEqual(["role-red"]);
  });

  test("handles string role format", () => {
    const stringRoleObj = {
      selectionMode: "unique",
      "😀": { roleId: "role-member" },
      "😎": { roleId: "role-admin" },
    };

    const memberRoles = new Set(["role-member"]);
    const removeOps = getRolesToRemove(stringRoleObj, "😎", memberRoles);

    expect(removeOps).toHaveLength(1);
    expect(removeOps[0].roles).toEqual(["role-member"]);
  });

  test("skips non-role keys in rolesObj", () => {
    const memberRoles = new Set(["role-member"]);

    const removeOps = getRolesToRemove(rolesObj, "😎", memberRoles);

    // Should not include hideList, selectionMode, or roles as emojis
    const emojiKeys = removeOps.map((op) => op.emoji);
    expect(emojiKeys).not.toContain("hideList");
    expect(emojiKeys).not.toContain("selectionMode");
    expect(emojiKeys).not.toContain("roles");
  });

  test("returns empty when user has no roles from other emojis", () => {
    const memberRoles = new Set(["role-unknown"]);

    const removeOps = getRolesToRemove(rolesObj, "😎", memberRoles);

    expect(removeOps).toHaveLength(0);
  });

  test("deploy stores selectionMode correctly", () => {
    // Simulate what the deploy controller does
    const selectionMode = "unique";
    const mappingData = { roles: {}, hideList: false };
    if (selectionMode && selectionMode !== "standard")
      mappingData.selectionMode = selectionMode;

    expect(mappingData.selectionMode).toBe("unique");
  });

  test("deploy does not store standard mode", () => {
    const selectionMode = "standard";
    const mappingData = { roles: {}, hideList: false };
    if (selectionMode && selectionMode !== "standard")
      mappingData.selectionMode = selectionMode;

    expect(mappingData.selectionMode).toBeUndefined();
  });
});

/**
 * Tests for both Standard and Unique mode in messageReactionRemove.
 */
function simulateRemoveHandler(rolesObj, removedEmoji, memberRoles, userReactions) {
  const roleConfig = rolesObj[removedEmoji];
  if (!roleConfig) return { removed: [] };

  const roleIds = resolveRoleIds(roleConfig);
  if (roleIds.length === 0) return { removed: [] };

  const selectionMode = rolesObj.selectionMode || "standard";

  let roleIdsToRemove = roleIds;

  if (selectionMode === "unique") {
    // Find all other emojis the user has reacted to
    const otherEmojisRoles = [];

    for (const [emojiKey, config] of Object.entries(rolesObj)) {
      if (["hideList", "selectionMode", "roles"].includes(emojiKey)) continue;
      if (typeof config === "boolean" || config == null) continue;
      if (emojiKey === removedEmoji) continue;

      // Check if user has reacted with this other emoji
      if (userReactions.has(emojiKey)) {
        const otherRoleIds = resolveRoleIds(config);
        otherEmojisRoles.push(...otherRoleIds);
      }
    }

    // Only remove roles NOT assigned by any other active emoji
    roleIdsToRemove = roleIds.filter((id) => !otherEmojisRoles.includes(id));
  }

  // Only remove roles the member actually has
  const rolesToRemove = roleIdsToRemove.filter((id) => memberRoles.has(id));

  return { removed: rolesToRemove };
}

describe("Standard Mode - messageReactionRemove", () => {
  const rolesObj = {
    "😀": { roleIds: ["role-member", "role-coder"] },
    "😎": { roleIds: ["role-gamer", "role-admin"] },
  };

  test("removes all roles for the unreacted emoji", () => {
    const memberRoles = new Set(["role-member", "role-coder"]);
    const userReactions = new Set(); // user removed reaction, no active reactions

    const result = simulateRemoveHandler(rolesObj, "😀", memberRoles, userReactions);

    expect(result.removed).toEqual(
      expect.arrayContaining(["role-member", "role-coder"])
    );
    expect(result.removed).toHaveLength(2);
  });

  test("does not remove roles from other emojis", () => {
    const memberRoles = new Set([
      "role-member",
      "role-coder",
      "role-gamer",
      "role-admin",
    ]);
    const userReactions = new Set();

    const result = simulateRemoveHandler(rolesObj, "😀", memberRoles, userReactions);

    // Standard mode removes ALL roles for the emoji, regardless of other reactions
    expect(result.removed).toHaveLength(2);
    expect(result.removed).not.toContain("role-gamer");
    expect(result.removed).not.toContain("role-admin");
  });

  test("only removes roles the member has", () => {
    const memberRoles = new Set(["role-member"]); // only has 1 of 2
    const userReactions = new Set();

    const result = simulateRemoveHandler(rolesObj, "😀", memberRoles, userReactions);

    expect(result.removed).toEqual(["role-member"]);
  });
});

describe("Unique Mode - messageReactionRemove (bug fix)", () => {
  const rolesObj = {
    selectionMode: "unique",
    "😀": {
      roleIds: ["role-member", "role-sponsor", "role-coder", "role-artist"],
    },
    "😎": {
      roleIds: [
        "role-gamer",
        "role-coder",
        "role-ticket-team",
        "role-artist",
        "role-member",
        "role-sponsor",
        "role-mute",
        "role-moderator",
        "role-admin",
      ],
    },
  };

  test("preserves shared roles when user switched to another emoji", () => {
    // User clicked 😀, unique mode removed 😎's roles, assigned 😀's roles
    // Bot removed user's 😎 reaction → Discord fires messageReactionRemove
    // User still has 😀 reaction active
    const memberRoles = new Set([
      "role-member",
      "role-sponsor",
      "role-coder",
      "role-artist",
    ]);
    const userReactions = new Set(["😀"]); // user still has 😀 reaction

    const result = simulateRemoveHandler(rolesObj, "😎", memberRoles, userReactions);

    // Shared roles (member, sponsor, coder, artist) should NOT be removed
    // because they are assigned by 😀 which the user still has
    expect(result.removed).toHaveLength(0);
  });

  test("removes non-shared roles when user has no other reactions", () => {
    // User reacted to 😎, then removed reaction (no other emoji active)
    const memberRoles = new Set([
      "role-gamer",
      "role-coder",
      "role-ticket-team",
      "role-artist",
      "role-member",
      "role-sponsor",
      "role-mute",
      "role-moderator",
      "role-admin",
    ]);
    const userReactions = new Set(); // no active reactions

    const result = simulateRemoveHandler(rolesObj, "😎", memberRoles, userReactions);

    // All 9 roles should be removed (no other emoji to protect them)
    expect(result.removed).toHaveLength(9);
  });

  test("removes non-shared roles but preserves shared ones", () => {
    // User has 😎 roles, also reacted to 😀 (which shares some roles)
    // User removes 😎 reaction
    const memberRoles = new Set([
      "role-gamer",
      "role-coder",
      "role-ticket-team",
      "role-artist",
      "role-member",
      "role-sponsor",
      "role-mute",
      "role-moderator",
      "role-admin",
    ]);
    const userReactions = new Set(["😀"]); // user still has 😀

    const result = simulateRemoveHandler(rolesObj, "😎", memberRoles, userReactions);

    // Should remove ONLY non-shared roles from 😎:
    // 😎 unique roles: gamer, ticket-team, mute, moderator, admin
    // Shared with 😀: coder, artist, member, sponsor (should be kept)
    expect(result.removed).toEqual(
      expect.arrayContaining([
        "role-gamer",
        "role-ticket-team",
        "role-mute",
        "role-moderator",
        "role-admin",
      ])
    );
    expect(result.removed).not.toContain("role-coder");
    expect(result.removed).not.toContain("role-artist");
    expect(result.removed).not.toContain("role-member");
    expect(result.removed).not.toContain("role-sponsor");
    expect(result.removed).toHaveLength(5);
  });

  test("handles the exact bug scenario from Discord logs", () => {
    // From the actual logs:
    // 1. User clicks 😀 (4 roles: member, sponsor, coder, artist)
    // 2. Unique mode removes 😇's 9 roles, removes 😇 reaction, assigns 😀's 4 roles
    // 3. Discord fires messageReactionRemove for 😇
    // 4. Remove handler should NOT remove shared roles

    const rolesObjFromLogs = {
      selectionMode: "unique",
      "😀": {
        roleIds: [
          "1392730795487006822", // member
          "1392731487039651890", // sponsor
          "1479779260247052470", // coder
          "1392731371427987589", // artist
        ],
      },
      "😇": {
        roleIds: [
          "1392730795487006822", // member (shared)
          "1392731487039651890", // sponsor (shared)
          "1479779260247052470", // coder (shared)
          "1392731371427987589", // artist (shared)
          "1124619318831886388", // gamer (unique to 😇)
          "1411245215020482691", // ticket-team (unique to 😇)
          "1434607998965252308", // mute (unique to 😇)
          "1124615868584837140", // moderator (unique to 😇)
          "1125422941396545588", // admin (unique to 😇)
        ],
      },
    };

    // After unique mode: user has 😀's 4 roles, 😇 reaction was removed
    const memberRoles = new Set([
      "1392730795487006822", // member
      "1392731487039651890", // sponsor
      "1479779260247052470", // coder
      "1392731371427987589", // artist
    ]);
    const userReactions = new Set(["😀"]);

    const result = simulateRemoveHandler(
      rolesObjFromLogs,
      "😇",
      memberRoles,
      userReactions
    );

    // Before fix: would remove all 9 roles (including 4 shared ones)
    // After fix: removes 0 (all shared roles protected by 😀)
    expect(result.removed).toHaveLength(0);
  });
});
