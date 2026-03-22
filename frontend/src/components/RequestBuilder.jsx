import { useState } from "react";
import {
  PaperPlaneRight,
  FloppyDisk,
  X,
  Plus,
  CaretDown,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

const methodColors = {
  HEAD: "text-cyan-500",
  OPTIONS: "text-pink-500",
  GET: "text-emerald-500",
  POST: "text-blue-500",
  PUT: "text-amber-500",
  PATCH: "text-purple-500",
  DELETE: "text-red-500",
};

export function RequestBuilder({
  request,
  onChange,
  onSend,
  onSave,
  isLoading,
  activeEnvironment,
}) {
  const [activeTab, setActiveTab] = useState("params");

  const updateRequest = (updates) => {
    onChange({ ...request, ...updates });
  };

  const addKeyValue = (field) => {
    const current = request[field] || [];
    updateRequest({
      [field]: [...current, { key: "", value: "", enabled: true }],
    });
  };

  const updateKeyValue = (field, index, updates) => {
    const current = [...(request[field] || [])];
    current[index] = { ...current[index], ...updates };
    updateRequest({ [field]: current });
  };

  const removeKeyValue = (field, index) => {
    const current = [...(request[field] || [])];
    current.splice(index, 1);
    updateRequest({ [field]: current });
  };

  const updateAuth = (updates) => {
    updateRequest({ auth: { ...request.auth, ...updates } });
  };

  return (
    <div className="flex flex-col h-full border-b lg:border-b-0 lg:border-r border-zinc-800 bg-[#09090b]">
      {/* Request Name & Actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800">
        <Input
          value={request.name}
          onChange={(e) => updateRequest({ name: e.target.value })}
          className="h-8 bg-transparent border-none text-sm font-medium text-zinc-100 focus-visible:ring-0 px-0"
          placeholder="Request Name"
          data-testid="request-name-input"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={onSave}
          className="h-7 px-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          data-testid="save-request-btn"
        >
          <FloppyDisk size={14} className="mr-1" /> Save
        </Button>
      </div>

      {/* URL Bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
        <Select
          value={request.method}
          onValueChange={(value) => updateRequest({ method: value })}
        >
          <SelectTrigger
            className={`w-28 h-9 bg-zinc-900 border-zinc-700 font-mono font-semibold ${methodColors[request.method]}`}
            data-testid="method-selector"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-zinc-900 border-zinc-800">
            {HTTP_METHODS.map((method) => (
              <SelectItem
                key={method}
                value={method}
                className={`font-mono font-semibold ${methodColors[method]} hover:bg-zinc-800`}
                data-testid={`method-option-${method.toLowerCase()}`}
              >
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={request.url}
          onChange={(e) => updateRequest({ url: e.target.value })}
          placeholder="Enter URL or paste text"
          className="flex-1 h-9 bg-zinc-900 border-zinc-700 font-mono text-sm focus:border-zinc-600"
          data-testid="url-input"
          onKeyDown={(e) => e.key === "Enter" && onSend()}
        />

        <Button
          onClick={onSend}
          disabled={isLoading}
          className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium"
          data-testid="send-request-btn"
        >
          {isLoading ? (
            <span className="flex items-center">
              <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Sending
            </span>
          ) : (
            <>
              <PaperPlaneRight size={16} className="mr-1" /> Send
            </>
          )}
        </Button>
      </div>

      {/* Environment Variables Hint */}
      {activeEnvironment && (
        <div className="px-4 py-1 bg-zinc-900/50 border-b border-zinc-800">
          <span className="text-xs text-zinc-500">
            Environment: <span className="text-blue-400">{activeEnvironment.name}</span>
            {" - Use "}
            <code className="text-emerald-400">{"{{variable}}"}</code>
            {" syntax"}
          </span>
        </div>
      )}

      {/* Request Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start gap-0 h-9 bg-transparent border-b border-zinc-800 rounded-none px-4">
          <TabsTrigger
            value="params"
            className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500"
            data-testid="params-tab"
          >
            Params
            {request.params?.filter((p) => p.enabled && p.key).length > 0 && (
              <span className="ml-1 text-[10px] text-zinc-500">
                ({request.params.filter((p) => p.enabled && p.key).length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="headers"
            className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500"
            data-testid="headers-tab"
          >
            Headers
            {request.headers?.filter((h) => h.enabled && h.key).length > 0 && (
              <span className="ml-1 text-[10px] text-zinc-500">
                ({request.headers.filter((h) => h.enabled && h.key).length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="body"
            className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500"
            data-testid="body-tab"
          >
            Body
          </TabsTrigger>
          <TabsTrigger
            value="auth"
            className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500"
            data-testid="auth-tab"
          >
            Auth
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Params Tab */}
          <TabsContent value="params" className="m-0 p-4">
            <KeyValueTable
              items={request.params || []}
              onAdd={() => addKeyValue("params")}
              onUpdate={(index, updates) => updateKeyValue("params", index, updates)}
              onRemove={(index) => removeKeyValue("params", index)}
              keyPlaceholder="Parameter"
              valuePlaceholder="Value"
              testIdPrefix="param"
            />
          </TabsContent>

          {/* Headers Tab */}
          <TabsContent value="headers" className="m-0 p-4">
            <KeyValueTable
              items={request.headers || []}
              onAdd={() => addKeyValue("headers")}
              onUpdate={(index, updates) => updateKeyValue("headers", index, updates)}
              onRemove={(index) => removeKeyValue("headers", index)}
              keyPlaceholder="Header"
              valuePlaceholder="Value"
              testIdPrefix="header"
            />
          </TabsContent>

          {/* Body Tab */}
          <TabsContent value="body" className="m-0 p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Content Type:</span>
                <Select
                  value={request.body_type}
                  onValueChange={(value) => updateRequest({ body_type: value })}
                >
                  <SelectTrigger className="w-32 h-7 bg-zinc-900 border-zinc-700 text-xs" data-testid="body-type-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="json" className="text-xs">JSON</SelectItem>
                    <SelectItem value="xml" className="text-xs">XML</SelectItem>
                    <SelectItem value="text" className="text-xs">Text</SelectItem>
                    <SelectItem value="form" className="text-xs">Form</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <textarea
                value={request.body}
                onChange={(e) => updateRequest({ body: e.target.value })}
                placeholder={request.body_type === "json" ? '{\n  "key": "value"\n}' : "Enter request body"}
                className="w-full h-48 bg-zinc-900 border border-zinc-700 rounded-md p-3 font-mono text-sm text-zinc-100 resize-none focus:outline-none focus:border-zinc-600"
                data-testid="body-input"
              />
            </div>
          </TabsContent>

          {/* Auth Tab */}
          <TabsContent value="auth" className="m-0 p-4">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">Type:</span>
                <Select
                  value={request.auth?.type || "none"}
                  onValueChange={(value) => updateAuth({ type: value })}
                >
                  <SelectTrigger className="w-40 h-8 bg-zinc-900 border-zinc-700 text-xs" data-testid="auth-type-selector">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-800">
                    <SelectItem value="none" className="text-xs">No Auth</SelectItem>
                    <SelectItem value="bearer" className="text-xs">Bearer Token</SelectItem>
                    <SelectItem value="basic" className="text-xs">Basic Auth</SelectItem>
                    <SelectItem value="api_key" className="text-xs">API Key</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {request.auth?.type === "bearer" && (
                <div className="space-y-2">
                  <label className="text-xs text-zinc-500">Token</label>
                  <Input
                    value={request.auth.bearer_token || ""}
                    onChange={(e) => updateAuth({ bearer_token: e.target.value })}
                    placeholder="Enter bearer token"
                    className="h-8 bg-zinc-900 border-zinc-700 font-mono text-sm"
                    data-testid="bearer-token-input"
                  />
                </div>
              )}

              {request.auth?.type === "basic" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">Username</label>
                    <Input
                      value={request.auth.basic_username || ""}
                      onChange={(e) => updateAuth({ basic_username: e.target.value })}
                      placeholder="Username"
                      className="h-8 bg-zinc-900 border-zinc-700 text-sm"
                      data-testid="basic-username-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">Password</label>
                    <Input
                      type="password"
                      value={request.auth.basic_password || ""}
                      onChange={(e) => updateAuth({ basic_password: e.target.value })}
                      placeholder="Password"
                      className="h-8 bg-zinc-900 border-zinc-700 text-sm"
                      data-testid="basic-password-input"
                    />
                  </div>
                </div>
              )}

              {request.auth?.type === "api_key" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">Key Name</label>
                    <Input
                      value={request.auth.api_key_name || ""}
                      onChange={(e) => updateAuth({ api_key_name: e.target.value })}
                      placeholder="X-API-Key"
                      className="h-8 bg-zinc-900 border-zinc-700 text-sm"
                      data-testid="api-key-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">Key Value</label>
                    <Input
                      value={request.auth.api_key_value || ""}
                      onChange={(e) => updateAuth({ api_key_value: e.target.value })}
                      placeholder="Enter API key"
                      className="h-8 bg-zinc-900 border-zinc-700 font-mono text-sm"
                      data-testid="api-key-value-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-zinc-500">Add To</label>
                    <Select
                      value={request.auth.api_key_location || "header"}
                      onValueChange={(value) => updateAuth({ api_key_location: value })}
                    >
                      <SelectTrigger className="w-32 h-8 bg-zinc-900 border-zinc-700 text-xs" data-testid="api-key-location-selector">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        <SelectItem value="header" className="text-xs">Header</SelectItem>
                        <SelectItem value="query" className="text-xs">Query Param</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function KeyValueTable({
  items,
  onAdd,
  onUpdate,
  onRemove,
  keyPlaceholder,
  valuePlaceholder,
  testIdPrefix,
}) {
  return (
    <div className="space-y-2">
      <table className="kv-table">
        <thead>
          <tr>
            <th className="w-8"></th>
            <th>{keyPlaceholder}</th>
            <th>{valuePlaceholder}</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className="group">
              <td>
                <Checkbox
                  checked={item.enabled}
                  onCheckedChange={(checked) => onUpdate(index, { enabled: checked })}
                  className="border-zinc-600 data-[state=checked]:bg-blue-600"
                  data-testid={`${testIdPrefix}-${index}-enabled`}
                />
              </td>
              <td>
                <Input
                  value={item.key}
                  onChange={(e) => onUpdate(index, { key: e.target.value })}
                  placeholder={keyPlaceholder}
                  className="h-7 bg-transparent border-none text-sm focus-visible:ring-0"
                  data-testid={`${testIdPrefix}-${index}-key`}
                />
              </td>
              <td>
                <Input
                  value={item.value}
                  onChange={(e) => onUpdate(index, { value: e.target.value })}
                  placeholder={valuePlaceholder}
                  className="h-7 bg-transparent border-none text-sm focus-visible:ring-0"
                  data-testid={`${testIdPrefix}-${index}-value`}
                />
              </td>
              <td>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onRemove(index)}
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400"
                  data-testid={`${testIdPrefix}-${index}-remove`}
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
        onClick={onAdd}
        className="h-7 text-xs text-zinc-500 hover:text-zinc-100"
        data-testid={`add-${testIdPrefix}-btn`}
      >
        <Plus size={12} className="mr-1" /> Add {keyPlaceholder}
      </Button>
    </div>
  );
}
