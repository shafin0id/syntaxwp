import { z } from "zod";

// Canonical action whitelist. Mirrors architecture §8.2/§9.3 and must stay in
// sync with the plugin's ActionWhitelist.php (Task A6) — that PHP list is the
// enforcement point; this is the TypeScript-side contract.
export const WORK_ORDER_ACTIONS = [
  "deactivate_plugin",
  "activate_plugin",
  "update_plugin",
  "flush_cache",
  "clear_transients",
  "disable_maintenance_mode",
  "toggle_debug",
  "repair_db",
  "switch_theme",
  "update_core",
  "delete_plugin",
  "update_option",
  "run_arbitrary_command",
] as const;

export const WorkOrderActionSchema = z.enum(WORK_ORDER_ACTIONS);
export type WorkOrderAction = z.infer<typeof WorkOrderActionSchema>;

export const RiskLevelSchema = z.enum(["low", "medium", "high", "blocked"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const PermissionTierSchema = z.enum(["full_auto", "some_access", "manual"]);
export type PermissionTier = z.infer<typeof PermissionTierSchema>;

// Static risk classification, §9.3. The policy engine (Task A3) consumes this
// map; it does not compute risk itself.
export const ACTION_RISK_MAP: Record<WorkOrderAction, RiskLevel> = {
  flush_cache: "low",
  clear_transients: "low",
  disable_maintenance_mode: "low",
  deactivate_plugin: "medium",
  activate_plugin: "medium",
  switch_theme: "medium",
  update_plugin: "high",
  update_core: "high",
  delete_plugin: "high",
  repair_db: "high",
  toggle_debug: "medium",
  update_option: "medium",
  run_arbitrary_command: "blocked",
};
