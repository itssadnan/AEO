"use client";

import type { AiTaskConfigRow, ProviderName, FailoverMode } from "@/modules/admin";
import {
  upsertAiTaskConfigAction,
  deleteWorkspaceOverrideAction,
} from "@/modules/admin/actions";
import { useState } from "react";

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
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Task Configurations</h2>
      <p className="text-sm text-gray-500 mb-6">
        Global defaults (no workspace) apply to all workspaces unless overridden. Overrides are
        per-workspace and per-task.
      </p>

      <div className="space-y-8">
        {configsByTask.map(({ taskKey, global, overrides }) => (
          <div key={taskKey} className="border-t border-gray-100 pt-6 first:border-0 first:pt-0">
            <h3 className="text-lg font-medium text-gray-900 mb-4 capitalize">
              {taskKey.replace(/_/g, " ")}
            </h3>

            {/* Global default row */}
            {global && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Global Default</span>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      global.enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {global.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {editingId === global.id ? (
                  <div className="space-y-2">
                    <select
                      value={editForm?.provider}
                      onChange={(e) =>
                        setEditForm({ ...editForm!, provider: e.target.value as ProviderName })
                      }
                      className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p} value={p} className="capitalize">
                          {p.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={editForm?.model}
                      onChange={(e) =>
                        setEditForm({ ...editForm!, model: e.target.value })
                      }
                      placeholder="Model name (e.g., gemini-3.5-flash-lite)"
                      className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md text-sm"
                    />
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={editForm?.enabled}
                        onChange={(e) =>
                          setEditForm({ ...editForm!, enabled: e.target.checked })
                        }
                        className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                      />
                      Enabled
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEdit(global)}
                        className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setEditForm(null);
                        }}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-900">
                    <span className="font-mono">{global.provider}</span>
                    <span className="font-mono">{global.model}</span>
                    <button
                      onClick={() => startEdit(global)}
                      className="text-indigo-600 hover:text-indigo-900 font-medium"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Workspace overrides */}
            {overrides.length > 0 && (
              <div className="ml-4 border-l-2 border-gray-200 pl-4 space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Workspace Overrides</h4>
                {overrides.map((override) => (
                  <div key={override.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900">
                        {override.workspaceName} ({override.workspaceId?.slice(0, 8)}...)
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          override.enabled
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {override.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                    {editingId === override.id ? (
                      <div className="space-y-2">
                        <select
                          value={editForm?.provider}
                          onChange={(e) =>
                            setEditForm({ ...editForm!, provider: e.target.value as ProviderName })
                          }
                          className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-md text-sm"
                        >
                          {PROVIDERS.map((p) => (
                            <option key={p} value={p} className="capitalize">
                              {p.replace("_", " ")}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editForm?.model}
                          onChange={(e) =>
                            setEditForm({ ...editForm!, model: e.target.value })
                          }
                          placeholder="Model name"
                          className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded-md text-sm"
                        />
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={editForm?.enabled}
                            onChange={(e) =>
                              setEditForm({ ...editForm!, enabled: e.target.checked })
                            }
                            className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                          />
                          Enabled
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEdit(override)}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditForm(null);
                            }}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-900">
                        <span className="font-mono">{override.provider}</span>
                        <span className="font-mono">{override.model}</span>
                        <button
                          onClick={() => startEdit(override)}
                          className="text-indigo-600 hover:text-indigo-900 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteOverride(override.taskKey, override.workspaceId!)}
                          className="text-red-600 hover:text-red-900 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add new override */}
            {showAddOverride === taskKey ? (
              <div className="ml-4 mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="text-sm font-medium text-blue-900 mb-3">Add Workspace Override</h4>
                <div className="space-y-2 max-w-md space-y-3">
                  <input
                    type="text"
                    placeholder="Workspace ID (UUID)"
                    value={newOverride?.workspaceId}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride!, workspaceId: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Workspace Name (for display)"
                    value={newOverride?.workspaceName}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride!, workspaceName: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <select
                    value={newOverride?.provider}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride!, provider: e.target.value as ProviderName })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p} value={p} className="capitalize">
                        {p.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Model name (e.g., gemini-3.5-flash-lite)"
                    value={newOverride?.model}
                    onChange={(e) =>
                      setNewOverride({ ...newOverride!, model: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={newOverride?.enabled}
                      onChange={(e) =>
                        setNewOverride({ ...newOverride!, enabled: e.target.checked })
                      }
                      className="h-4 w-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                    />
                    Enabled
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAddOverride(taskKey)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
                    >
                      Add Override
                    </button>
                    <button
                      onClick={() => {
                        setShowAddOverride(null);
                        setNewOverride(null);
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => startAddOverride(taskKey)}
                className="ml-4 mt-4 text-sm text-indigo-600 hover:text-indigo-900 font-medium"
              >
                + Add workspace override
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}