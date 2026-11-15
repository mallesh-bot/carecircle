import type { Role } from "./types";

/**
 * Role rules. Every member of a circle can view and update the care plan
 * (that's the point of sharing it), but only the elder and caretakers can
 * remove people — the elder always stays in control of who is in their circle.
 */
export function canManageMembers(role: Role): boolean {
  return role === "elder" || role === "caretaker";
}

/** The elder can never be removed by someone else. */
export function canRemove(actorRole: Role, targetRole: Role, isSelf: boolean): boolean {
  return canManageMembers(actorRole) && !isSelf && targetRole !== "elder";
}
