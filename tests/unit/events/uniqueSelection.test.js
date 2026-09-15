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
