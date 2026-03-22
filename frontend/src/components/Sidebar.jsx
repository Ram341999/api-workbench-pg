import { useState, useRef } from "react";
import {
  FolderSimple,
  ClockCounterClockwise,
  Plus,
  CaretLeft,
  CaretRight,
  Trash,
  Globe,
  DotsThree,
  Export,
  Upload,
  SignOut,
  User,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

const methodColors = {
  GET: "method-badge-get",
  POST: "method-badge-post",
  PUT: "method-badge-put",
  PATCH: "method-badge-patch",
  DELETE: "method-badge-delete",
};

export function Sidebar({
  collapsed,
  onToggleCollapse,
  collections,
  requests,
  history,
  environments,
  activeEnvironment,
  onSelectRequest,
  onSelectHistoryItem,
  onNewRequest,
  onCreateCollection,
  onDeleteCollection,
  onDeleteRequest,
  onClearHistory,
  onOpenEnvModal,
  onActivateEnvironment,
  onImportDone,
}) {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("collections");
  const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      onCreateCollection(newCollectionName.trim());
      setNewCollectionName("");
      setShowNewCollectionDialog(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await api.exportCollection();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "api_workbench_export.json";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Collection exported");
    } catch {
      toast.error("Export failed");
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportText(ev.target.result);
      setShowImportDialog(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleDoImport = async () => {
    setImportLoading(true);
    try {
      const parsed = JSON.parse(importText);
      const result = await api.importCollection(parsed);
      toast.success(result.message);
      setShowImportDialog(false);
      setImportText("");
      onImportDone?.();
    } catch (e) {
      toast.error("Import failed: " + (e.response?.data?.detail || e.message));
    } finally {
      setImportLoading(false);
    }
  };

  // ── Collapsed sidebar ──
  if (collapsed) {
    return (
      <aside className="w-12 h-screen bg-[#09090b] border-r border-zinc-800 flex flex-col items-center py-3 gap-2">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
          <CaretRight size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNewRequest} className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
          <Plus size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setActiveTab("collections")} className={`h-8 w-8 ${activeTab === "collections" ? "text-blue-500" : "text-zinc-400"} hover:text-zinc-100 hover:bg-zinc-800`}>
          <FolderSimple size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setActiveTab("history")} className={`h-8 w-8 ${activeTab === "history" ? "text-blue-500" : "text-zinc-400"} hover:text-zinc-100 hover:bg-zinc-800`}>
          <ClockCounterClockwise size={16} />
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenEnvModal} className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 mt-auto">
          <Globe size={16} />
        </Button>
      </aside>
    );
  }

  // ── Full sidebar ──
  return (
    <aside className="w-64 h-screen bg-[#09090b] flex flex-col" data-testid="sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3h10M1 6h7M1 9h4" stroke="white" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <span className="font-semibold text-sm text-zinc-100">API Workbench</span>
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-7 w-7 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800">
          <CaretLeft size={14} />
        </Button>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-1 p-2 border-b border-zinc-800">
        <Button onClick={onNewRequest} className="flex-1 h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs" data-testid="new-request-btn">
          <Plus size={12} className="mr-1" /> New Request
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" title="Export collection" onClick={handleExport}>
          <Export size={14} />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" title="Import collection" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} />
        </Button>
        <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start gap-0 h-9 bg-transparent border-b border-zinc-800 rounded-none px-2">
          <TabsTrigger value="collections" className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500" data-testid="collections-tab">
            <FolderSimple size={14} className="mr-1" /> Collections
          </TabsTrigger>
          <TabsTrigger value="history" className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500" data-testid="history-tab">
            <ClockCounterClockwise size={14} className="mr-1" /> History
          </TabsTrigger>
        </TabsList>

        {/* Collections Tab */}
        <TabsContent value="collections" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNewCollectionDialog(true)} className="w-full h-7 justify-start text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 mb-2" data-testid="add-collection-btn">
                <Plus size={12} className="mr-1" /> Add Collection
              </Button>

              {collections.map((collection) => (
                <CollectionItem
                  key={collection.id}
                  collection={collection}
                  requests={requests.filter((r) => r.collection_id === collection.id)}
                  onSelectRequest={onSelectRequest}
                  onDeleteCollection={onDeleteCollection}
                  onDeleteRequest={onDeleteRequest}
                />
              ))}

              {requests.filter((r) => !r.collection_id).length > 0 && (
                <div className="mt-2">
                  <div className="text-xs text-zinc-500 px-2 py-1">Uncategorized</div>
                  {requests.filter((r) => !r.collection_id).map((request) => (
                    <RequestItem key={request.id} request={request} onSelect={onSelectRequest} onDelete={onDeleteRequest} />
                  ))}
                </div>
              )}

              {collections.length === 0 && requests.length === 0 && (
                <div className="text-center text-xs text-zinc-500 py-8">No requests yet.<br />Click "New Request" to start.</div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-2">
              {history.length > 0 && (
                <Button variant="ghost" size="sm" onClick={onClearHistory} className="w-full h-7 justify-start text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800 mb-2" data-testid="clear-history-btn">
                  <Trash size={12} className="mr-1" /> Clear History
                </Button>
              )}
              {history.map((item) => (
                <HistoryItem key={item.id} item={item} onSelect={onSelectHistoryItem} />
              ))}
              {history.length === 0 && (
                <div className="text-center text-xs text-zinc-500 py-8">No history yet</div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Environment Selector */}
      <div className="px-2 py-1 border-t border-zinc-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full h-8 justify-between text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="env-selector-btn">
              <span className="flex items-center"><Globe size={14} className="mr-2" />{activeEnvironment ? activeEnvironment.name : "No Environment"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-zinc-800">
            <DropdownMenuItem onClick={onOpenEnvModal} className="text-xs hover:bg-zinc-800">Manage Environments</DropdownMenuItem>
            {environments.length > 0 && (
              <>
                <DropdownMenuSeparator className="bg-zinc-800" />
                {environments.map((env) => (
                  <DropdownMenuItem key={env.id} onClick={() => onActivateEnvironment(env)} className={`text-xs hover:bg-zinc-800 ${env.is_active ? "text-blue-400" : ""}`}>
                    {env.name}{env.is_active && " ✓"}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* User row */}
      <div className="p-2 border-t border-zinc-800">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full h-9 justify-start gap-2 text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-2">
              {user?.picture ? (
                <img src={user.picture} alt={user.name} className="w-6 h-6 rounded-full flex-shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
                  <User size={12} className="text-zinc-400" />
                </div>
              )}
              <span className="truncate flex-1 text-left text-zinc-300">{user?.name || user?.email || "User"}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-zinc-900 border-zinc-800">
            <div className="px-3 py-2 border-b border-zinc-800">
              <div className="text-xs font-medium text-zinc-200">{user?.name}</div>
              <div className="text-[11px] text-zinc-500">{user?.email}</div>
            </div>
            <DropdownMenuItem onClick={logout} className="text-xs text-red-400 hover:bg-zinc-800 mt-1 gap-2">
              <SignOut size={13} /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* New Collection Dialog */}
      <Dialog open={showNewCollectionDialog} onOpenChange={setShowNewCollectionDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader><DialogTitle className="text-zinc-100">New Collection</DialogTitle></DialogHeader>
          <Input value={newCollectionName} onChange={(e) => setNewCollectionName(e.target.value)} placeholder="Collection name" className="bg-zinc-950 border-zinc-800" onKeyDown={(e) => e.key === "Enter" && handleCreateCollection()} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewCollectionDialog(false)} className="text-zinc-400 hover:text-zinc-100">Cancel</Button>
            <Button onClick={handleCreateCollection} className="bg-blue-600 hover:bg-blue-700">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-lg">
          <DialogHeader><DialogTitle className="text-zinc-100">Import Collection</DialogTitle></DialogHeader>
          <p className="text-xs text-zinc-500 mb-2">Supports API Workbench JSON exports and Postman v2.1 collections.</p>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            className="w-full h-40 bg-zinc-950 border border-zinc-800 rounded-md p-3 font-mono text-xs text-zinc-300 resize-none focus:outline-none focus:border-zinc-600"
            placeholder='{"requests":[...]}'
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowImportDialog(false)} className="text-zinc-400 hover:text-zinc-100">Cancel</Button>
            <Button onClick={handleDoImport} disabled={importLoading} className="bg-blue-600 hover:bg-blue-700">
              {importLoading ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function CollectionItem({ collection, requests, onSelectRequest, onDeleteCollection, onDeleteRequest }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="mb-1">
      <div className="flex items-center group">
        <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="flex-1 h-7 justify-start text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 px-2" data-testid={`collection-${collection.id}`}>
          <FolderSimple size={14} className="mr-2 text-zinc-500" />
          {collection.name}
          <span className="ml-auto text-zinc-600 text-xs">{requests.length}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-100"><DotsThree size={14} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
            <DropdownMenuItem onClick={() => onDeleteCollection(collection.id)} className="text-xs text-red-400 hover:bg-zinc-800"><Trash size={12} className="mr-2" /> Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {expanded && requests.length > 0 && (
        <div className="ml-4 border-l border-zinc-800 pl-2">
          {requests.map((request) => (
            <RequestItem key={request.id} request={request} onSelect={onSelectRequest} onDelete={onDeleteRequest} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestItem({ request, onSelect, onDelete }) {
  return (
    <div className="flex items-center group">
      <Button variant="ghost" size="sm" onClick={() => onSelect(request)} className="flex-1 h-7 justify-start text-xs text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 px-2 overflow-hidden" data-testid={`request-${request.id}`}>
        <span className={`font-mono text-[10px] px-1 rounded mr-2 ${methodColors[request.method] || "method-badge-get"}`}>{request.method}</span>
        <span className="truncate">{request.name}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-100"><DotsThree size={14} /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
          <DropdownMenuItem onClick={() => onDelete(request.id)} className="text-xs text-red-400 hover:bg-zinc-800"><Trash size={12} className="mr-2" /> Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function HistoryItem({ item, onSelect }) {
  const formatTime = (ts) => {
    const d = new Date(ts), now = new Date(), diff = Math.floor((now - d) / 60000);
    if (diff < 1) return "Just now";
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h ago`;
    return d.toLocaleDateString();
  };
  return (
    <Button variant="ghost" size="sm" onClick={() => onSelect(item)} className="w-full h-auto py-2 justify-start text-left hover:bg-zinc-800 px-2 mb-1" data-testid={`history-${item.id}`}>
      <div className="flex flex-col w-full overflow-hidden">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[10px] px-1 rounded ${methodColors[item.method] || "method-badge-get"}`}>{item.method}</span>
          <span className={`text-xs ${item.status_code >= 400 ? "text-red-400" : item.status_code >= 200 ? "text-green-400" : "text-zinc-400"}`}>{item.status_code || "ERR"}</span>
          {item.response_time && <span className="text-[10px] text-zinc-600">{item.response_time}ms</span>}
          <span className="text-[10px] text-zinc-600 ml-auto">{formatTime(item.timestamp)}</span>
        </div>
        <span className="text-xs text-zinc-400 truncate mt-0.5 font-mono">{item.url}</span>
      </div>
    </Button>
  );
}
