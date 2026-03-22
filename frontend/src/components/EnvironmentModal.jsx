import { useState, useEffect } from "react";
import { Plus, Trash, X, PencilSimple, Check } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function EnvironmentModal({ open, onOpenChange, environments, onRefresh }) {
  const [selectedEnv, setSelectedEnv] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [envName, setEnvName] = useState("");
  const [variables, setVariables] = useState([]);

  useEffect(() => {
    if (selectedEnv) {
      setEnvName(selectedEnv.name);
      setVariables(selectedEnv.variables || []);
    } else {
      setEnvName("");
      setVariables([]);
    }
    setEditingName(false);
  }, [selectedEnv]);

  const handleCreateEnvironment = async () => {
    try {
      const newEnv = await api.createEnvironment({
        name: "New Environment",
        variables: [],
      });
      onRefresh();
      setSelectedEnv(newEnv);
      setEditingName(true);
      toast.success("Environment created");
    } catch (err) {
      toast.error("Failed to create environment");
    }
  };

  const handleSaveEnvironment = async () => {
    if (!selectedEnv) return;

    try {
      await api.updateEnvironment(selectedEnv.id, {
        name: envName,
        variables: variables,
        is_active: selectedEnv.is_active,
      });
      onRefresh();
      toast.success("Environment saved");
    } catch (err) {
      toast.error("Failed to save environment");
    }
  };

  const handleDeleteEnvironment = async (env) => {
    try {
      await api.deleteEnvironment(env.id);
      onRefresh();
      if (selectedEnv?.id === env.id) {
        setSelectedEnv(null);
      }
      toast.success("Environment deleted");
    } catch (err) {
      toast.error("Failed to delete environment");
    }
  };

  const addVariable = () => {
    setVariables([...variables, { key: "", value: "", enabled: true }]);
  };

  const updateVariable = (index, updates) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], ...updates };
    setVariables(updated);
  };

  const removeVariable = (index) => {
    const updated = [...variables];
    updated.splice(index, 1);
    setVariables(updated);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[70vh] bg-zinc-900 border-zinc-800 p-0 gap-0">
        <DialogHeader className="p-4 border-b border-zinc-800">
          <DialogTitle className="text-zinc-100">Manage Environments</DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Environment List */}
          <div className="w-56 border-r border-zinc-800 flex flex-col">
            <div className="p-2 border-b border-zinc-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateEnvironment}
                className="w-full h-8 justify-start text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
                data-testid="create-env-btn"
              >
                <Plus size={14} className="mr-2" /> New Environment
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2">
                {environments.map((env) => (
                  <div
                    key={env.id}
                    className={`flex items-center group rounded-md ${
                      selectedEnv?.id === env.id
                        ? "bg-zinc-800"
                        : "hover:bg-zinc-800/50"
                    }`}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedEnv(env)}
                      className={`flex-1 h-8 justify-start text-xs px-2 ${
                        selectedEnv?.id === env.id
                          ? "text-zinc-100"
                          : "text-zinc-400"
                      }`}
                      data-testid={`env-item-${env.id}`}
                    >
                      {env.name}
                      {env.is_active && (
                        <span className="ml-auto text-[10px] text-blue-400">active</span>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteEnvironment(env)}
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 mr-1"
                      data-testid={`delete-env-${env.id}`}
                    >
                      <Trash size={12} />
                    </Button>
                  </div>
                ))}
                {environments.length === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-4">
                    No environments yet
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Environment Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedEnv ? (
              <>
                <div className="flex items-center gap-2 p-4 border-b border-zinc-800">
                  {editingName ? (
                    <Input
                      value={envName}
                      onChange={(e) => setEnvName(e.target.value)}
                      className="h-8 bg-zinc-950 border-zinc-700 text-sm"
                      autoFocus
                      onBlur={() => setEditingName(false)}
                      onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
                      data-testid="env-name-input"
                    />
                  ) : (
                    <h3
                      className="text-sm font-medium text-zinc-100 cursor-pointer hover:text-blue-400 flex items-center gap-2"
                      onClick={() => setEditingName(true)}
                    >
                      {envName}
                      <PencilSimple size={12} className="text-zinc-500" />
                    </h3>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSaveEnvironment}
                    className="ml-auto h-7 bg-blue-600 hover:bg-blue-700 text-xs"
                    data-testid="save-env-btn"
                  >
                    <Check size={12} className="mr-1" /> Save
                  </Button>
                </div>

                <ScrollArea className="flex-1">
                  <div className="p-4">
                    <h4 className="text-xs text-zinc-500 mb-3">Variables</h4>
                    <table className="kv-table">
                      <thead>
                        <tr>
                          <th className="w-8"></th>
                          <th>Variable</th>
                          <th>Value</th>
                          <th className="w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {variables.map((variable, index) => (
                          <tr key={index} className="group">
                            <td>
                              <Checkbox
                                checked={variable.enabled}
                                onCheckedChange={(checked) =>
                                  updateVariable(index, { enabled: checked })
                                }
                                className="border-zinc-600 data-[state=checked]:bg-blue-600"
                                data-testid={`env-var-${index}-enabled`}
                              />
                            </td>
                            <td>
                              <Input
                                value={variable.key}
                                onChange={(e) =>
                                  updateVariable(index, { key: e.target.value })
                                }
                                placeholder="VARIABLE_NAME"
                                className="h-7 bg-transparent border-none text-sm font-mono focus-visible:ring-0"
                                data-testid={`env-var-${index}-key`}
                              />
                            </td>
                            <td>
                              <Input
                                value={variable.value}
                                onChange={(e) =>
                                  updateVariable(index, { value: e.target.value })
                                }
                                placeholder="value"
                                className="h-7 bg-transparent border-none text-sm font-mono focus-visible:ring-0"
                                data-testid={`env-var-${index}-value`}
                              />
                            </td>
                            <td>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeVariable(index)}
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
                                data-testid={`env-var-${index}-remove`}
                              >
                                <X size={12} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addVariable}
                      className="h-7 text-xs text-zinc-500 hover:text-zinc-100 mt-2"
                      data-testid="add-env-var-btn"
                    >
                      <Plus size={12} className="mr-1" /> Add Variable
                    </Button>

                    <div className="mt-6 p-3 bg-zinc-950 rounded-md border border-zinc-800">
                      <h5 className="text-xs text-zinc-400 mb-2">Usage</h5>
                      <p className="text-xs text-zinc-500">
                        Use <code className="text-emerald-400">{"{{variable_name}}"}</code> in your
                        request URL, headers, or body to substitute with the variable value.
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-zinc-500">
                  Select an environment or create a new one
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
