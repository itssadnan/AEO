"use client";

import type { AiTaskConfigRow, ProviderName, FailoverMode } from "@/modules/admin";
import { upsertAiTaskConfigAction, deleteWorkspaceOverrideAction } from "@/modules/admin/actions";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Checkbox } from "@/components/ui/input";

interface AiTaskConfigsSectionProps {
  aiTaskConfigs: AiTaskConfigRow[];
}

const TASK_KEYS = [
  "grounded_search",
  "extraction",
  "explanation_generation",
  "prompt_suggestion",
  "outreach_email_drafting",
] as const;

const PROVIDERS: ProviderName[] = ["gemini", "nvidia_nim"];

// Restyled onto the shared design system (Module 5.6) 2026-09-01 — all
// state/handlers/logic below unchanged, only markup/classes touched.
export function AiTaskConfigsSection({ aiTaskConfigs }: AiTaskConfigsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    provider: ProviderName;
    model: string;
    enabled: boolean;
  } | null>(null);
  const [showAddOverride, setShowAddOverride] = useState<string | null>(null);
  const [newOverride, setNewOverride] = useState<{
    taskKey: string;
    workspaceId: string;
    workspaceName: string;
    provider: ProviderName;
    model: string;
    enabled: boolean;
  } | null>(null);

  // Group configs by task key
  const configsByTask = TASK_KEYS.map((taskKey) => {
    const global = aiTaskConfigs.find((c) => c.taskKey === taskKey && c.workspaceId === null);
    const overrides = aiTaskConfigs.filter((c) => c.taskKey === taskKey && c.workspaceId !== null);
    return { taskKey, global, overrides };
  });

  async function handleSaveEdit(config: AiTaskConfigRow) {
    if (!editForm) return;
    const result = await upsertAiTaskConfigAction({
      taskKey: config.taskKey,
      workspaceId: config.workspaceId,
      provider: editForm.provider,
      model: editForm.model,
      enabled: editForm.enabled,
    });
    if ("error" in result) {
      alert(`Failed to save: ${result.error}`);
    } else {
      setEditingId(null);
      setEditForm(null);
      window.location.reload();
    }
  }

  async function handleDeleteOverride(taskKey: string, workspaceId: string) {
    if (!confirm("Delete this workspace override? The global default will apply instead.")) return;
    const result = await deleteWorkspaceOverrideAction(taskKey, workspaceId);
    if ("error" in result) {
      alert(`Failed to delete: ${result.error}`);
    } else {
      window.location.reload();
    }
  }

  async function handleAddOverride(taskKey: string) {
    if (!newOverride) return;
    const result = await upsertAiTaskConfigAction({
      taskKey: newOverride.taskKey,
      workspaceId: newOverride.workspaceId,
      provider: newOverride.provider,
      model: newOverride.model,
      enabled: newOverride.enabled,
    });
    if ("error" in result) {
      alert(`Failed to add override: ${result.error}`);
    } else {
      setShowAddOverride(null);
      setNewOverride(null);
      window.location.reload();
    }
  }

  function startEdit(config: AiTaskConfigRow) {
    setEditingId(config.id);
    setEditForm({
      provider: config.provider,
      model: config.model,
      enabled: config.enabled,
    });
  }

  function startAddOverride(taskKey: string) {
    setShowAddOverride(taskKey);
    setNewOverride({
      taskKey,
      workspaceId: "",
      workspaceName: "",
      provider: "gemini",
      model: "",
      enabled: true,
    });
  }

  return (
    <section className="rounded-xl border border-border bg-surface-1 p-6">
      <h2 className="mb-1 text-xl font-semibold text-text-primary">AI Task Configurations</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Global defaults (no workspace) apply to all workspaces unless overridden. Overrides are
        per-workspace and per-task.
      </p>

      <div className="space-y-8">
        {configsByTask.map(({ taskKey, global, overrides }) => (
          <div key={taskKey} className="border-t border-border pt-6 first:border-0 first:pt-0">
            <h3 className="mb-4 text-lg font-medium text-text-primary capitalize">
              {taskKey.replace(/_/g, " ")}
            </h3>

            {/* Global default row */}
            {global && (
              <div className="mb-4 rounded-lg bg-surface-2 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-text-secondary">Global Default</span>
                  <Badge tone={global.enabled ? "positive" : "neutral"}>
                    {global.enabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                {editingId === global.id ? (
                  <div className="space-y-2">
                    <Select
                      value={editForm?.provider}
                      onChange={(e) =>
                        setEditForm({ ...editForm!, provider: e.target.value as ProviderName })
                      }
                      className="w-full md:w-48"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p} className="capitalize">
                          {p.replace("_", " ")}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="text"
                      value={editForm?.model}
                      onChange={(e) => setEditForm({ ...editForm!, model: e.target.value })}
                      placeholder="Model name (e.g., gemini-3.5-flash-lite)"
                      className="w-full md:w-64"
                    />
                    <label className="flex items-center gap-2 text-sm text-text-primary">
                      <Checkbox
                        checked={editForm?.enabled}
                        onChange={(e) => setEditForm({ ...editForm!, enabled: e.target.checked })}
                      />
                      Enabled
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleSaveEdit(global)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-4 text-sm text-text-primary">
                    <span className="font-mono">{global.provider}</span>
                    <span className="font-mono">{global.model}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="px-0 text-accent hover:text-accent-hover"
                      onClick={() => startEdit(global)}
                    >
                      Edit
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Workspace overrides */}
            {overrides.length > 0 && (
              <div className="ml-4 space-y-3 border-l-2 border-border pl-4">
                <h4 className="text-sm font-medium text-text-secondary">Workspace Overrides</h4>
                {overrides.map((override) => (
                  <div key={override.id} className="rounded-lg bg-surface-2 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-text-primary">
                        {override.workspaceName} ({override.workspaceId?.slice(0, 8)}...)
                      </span>
                      <Badge tone={override.enabled ? "positive" : "neutral"}>
                        {override.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    {editingId === override.id ? (
                      <div className="space-y-2">
                        <Select
                          value={editForm?.provider}
                          onChange={(e) =>
                            setEditForm({ ...editForm!, provider: e.target.value as ProviderName })
                          }
                          className="w-full md:w-48"
                        >
                          {PROVIDERS.map((p) => (
                            <option key={p} value={p} className="capitalize">
                              {p.replace("_", " ")}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="text"
                          value={editForm?.model}
                          onChange={(e) => setEditForm({ ...editForm!, model: e.target.value })}
                          placeholder="Model name"
                          className="w-full md:w-64"
                        />
                        <label className="flex items-center gap-2 text-sm text-text-primary">
                          <Checkbox
                            checked={editForm?.enabled}
                            onChange={(e) =>
                              setEditForm({ ...editForm!, enabled: e.target.checked })
                            }
                          />
                          Enabled
                        </label>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => handleSaveEdit(override)}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-4 text-sm text-text-primary">
                        <span className="font-mono">{override.provider}</span>
                        <span className="font-mono">{override.model}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-0 text-accent hover:text-accent-hover"
                          onClick={() => startEdit(override)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-0 text-negative hover:text-negative"
                          onClick={() =>
                            handleDeleteOverride(override.taskKey, override.workspaceId!)
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new override */}
            {showAddOverride === taskKey ? (
              <div className="mt-4 ml-4 rounded-lg border border-accent/30 bg-accent-muted p-4">
                <h4 className="mb-3 text-sm font-medium text-text-primary">
                  Add Workspace Override
                </h4>
                <div className="max-w-md space-y-3">
                  <Input
                    type="text"
                    placeholder="Workspace ID (UUID)"
                    value={newOverride?.workspaceId}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride!, workspaceId: e.target.value })
                    }
                  />
                  <Input
                    type="text"
                    placeholder="Workspace Name (for display)"
                    value={newOverride?.workspaceName}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride!, workspaceName: e.target.value })
                    }
                  />
                  <Select
                    value={newOverride?.provider}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride!, provider: e.target.value as ProviderName })
                    }
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p} className="capitalize">
                        {p.replace("_", " ")}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="text"
                    placeholder="Model name (e.g., gemini-3.5-flash-lite)"
                    value={newOverride?.model}
                    onChange={(e) => setNewOverride({ ...newOverride!, model: e.target.value })}
                  />
                  <label className="flex items-center gap-2 text-sm text-text-primary">
                    <Checkbox
                      checked={newOverride?.enabled}
                      onChange={(e) =>
                        setNewOverride({ ...newOverride!, enabled: e.target.checked })
                      }
                    />
                    Enabled
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => handleAddOverride(taskKey)}>
                      Add Override
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowAddOverride(null);
                        setNewOverride(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="mt-4 ml-4 px-0 text-accent hover:text-accent-hover"
                onClick={() => startAddOverride(taskKey)}
              >
                + Add workspace override
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
