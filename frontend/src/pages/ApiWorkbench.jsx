import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { RequestBuilder } from "@/components/RequestBuilder";
import { ResponseViewer } from "@/components/ResponseViewer";
import { EnvironmentModal } from "@/components/EnvironmentModal";
import { api } from "@/lib/api";
import { toast } from "sonner";

const defaultRequest = {
  id: null,
  name: "New Request",
  method: "GET",
  url: "",
  params: [],
  headers: [],
  body: "",
  body_type: "json",
  auth: { type: "none" },
  collection_id: null,
};

export default function ApiWorkbench() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [collections, setCollections] = useState([]);
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [activeEnvironment, setActiveEnvironment] = useState(null);
  const [currentRequest, setCurrentRequest] = useState({ ...defaultRequest });
  const [response, setResponse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showEnvModal, setShowEnvModal] = useState(false);

  useEffect(() => {
    fetchAll(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAll = () => {
    fetchCollections();
    fetchRequests();
    fetchHistory();
    fetchEnvironments();
  };

  const fetchCollections = async () => {
    try { setCollections(await api.getCollections()); } catch {}
  };
  const fetchRequests = async () => {
    try { setRequests(await api.getRequests()); } catch {}
  };
  const fetchHistory = async () => {
    try { setHistory(await api.getHistory()); } catch {}
  };
  const fetchEnvironments = async () => {
    try {
      const data = await api.getEnvironments();
      setEnvironments(data);
      const active = data.find((e) => e.is_active);
      if (active) setActiveEnvironment(active);
    } catch {}
  };

  // Resolve env vars in a string
  const resolveVars = useCallback((str) => {
    if (!activeEnvironment) return str;
    let out = str;
    activeEnvironment.variables.forEach((v) => {
      if (v.enabled) out = out.replace(new RegExp(`{{${v.key}}}`, "g"), v.value);
    });
    return out;
  }, [activeEnvironment]);

  const handleSendRequest = useCallback(async () => {
    if (!currentRequest.url) {
      toast.error("Please enter a URL");
      return;
    }
    setIsLoading(true);
    setResponse(null);
    try {
      const processed = {
        ...currentRequest,
        url: resolveVars(currentRequest.url),
        headers: (currentRequest.headers || []).map((h) => ({ ...h, value: resolveVars(h.value) })),
        params: (currentRequest.params || []).map((p) => ({ ...p, value: resolveVars(p.value) })),
        body: resolveVars(currentRequest.body || ""),
      };
      const result = await api.executeRequest(processed);
      setResponse(result);
      fetchHistory();
      toast.success(`${currentRequest.method} ${result.status_code}`);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || "Request failed";
      setResponse({
        status_code: err.response?.status || 0,
        headers: {},
        body: JSON.stringify({ error: errorMsg }, null, 2),
        response_time: 0,
        response_size: 0,
        redirect_count: 0,
        final_url: "",
      });
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [currentRequest, resolveVars]);

  const handleSaveRequest = async () => {
    if (!currentRequest.name) { toast.error("Please enter a request name"); return; }
    try {
      if (currentRequest.id) {
        await api.updateRequest(currentRequest.id, currentRequest);
        toast.success("Request updated");
      } else {
        const saved = await api.createRequest(currentRequest);
        setCurrentRequest(saved);
        toast.success("Request saved");
      }
      fetchRequests();
    } catch { toast.error("Failed to save request"); }
  };

  const handleSelectRequest = (req) => { setCurrentRequest(req); setResponse(null); };
  const handleSelectHistoryItem = (item) => {
    setCurrentRequest({ ...defaultRequest, method: item.method, url: item.url, name: item.request_name });
    setResponse(null);
  };
  const handleNewRequest = () => { setCurrentRequest({ ...defaultRequest }); setResponse(null); };
  const handleCreateCollection = async (name) => {
    try { await api.createCollection({ name }); fetchCollections(); toast.success("Collection created"); }
    catch { toast.error("Failed to create collection"); }
  };
  const handleDeleteCollection = async (id) => {
    try { await api.deleteCollection(id); fetchCollections(); fetchRequests(); toast.success("Collection deleted"); }
    catch { toast.error("Failed to delete collection"); }
  };
  const handleDeleteRequest = async (id) => {
    try {
      await api.deleteRequest(id);
      fetchRequests();
      if (currentRequest.id === id) handleNewRequest();
      toast.success("Request deleted");
    } catch { toast.error("Failed to delete request"); }
  };
  const handleClearHistory = async () => {
    try { await api.clearHistory(); setHistory([]); toast.success("History cleared"); }
    catch { toast.error("Failed to clear history"); }
  };
  const handleActivateEnvironment = async (env) => {
    try {
      await api.activateEnvironment(env.id);
      setActiveEnvironment(env);
      fetchEnvironments();
      toast.success(`Environment "${env.name}" activated`);
    } catch { toast.error("Failed to activate environment"); }
  };

  return (
    <div className={`app-container ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-testid="api-workbench">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        collections={collections}
        requests={requests}
        history={history}
        environments={environments}
        activeEnvironment={activeEnvironment}
        onSelectRequest={handleSelectRequest}
        onSelectHistoryItem={handleSelectHistoryItem}
        onNewRequest={handleNewRequest}
        onCreateCollection={handleCreateCollection}
        onDeleteCollection={handleDeleteCollection}
        onDeleteRequest={handleDeleteRequest}
        onClearHistory={handleClearHistory}
        onOpenEnvModal={() => setShowEnvModal(true)}
        onActivateEnvironment={handleActivateEnvironment}
        onImportDone={fetchAll}
      />
      <main className="flex flex-col h-screen overflow-hidden border-l border-zinc-800">
        <div className="workspace-split flex-1 overflow-hidden">
          <RequestBuilder
            request={currentRequest}
            onChange={setCurrentRequest}
            onSend={handleSendRequest}
            onSave={handleSaveRequest}
            isLoading={isLoading}
            activeEnvironment={activeEnvironment}
          />
          <ResponseViewer
            response={response}
            isLoading={isLoading}
            currentRequest={currentRequest}
            activeEnvironment={activeEnvironment}
          />
        </div>
      </main>
      <EnvironmentModal
        open={showEnvModal}
        onOpenChange={setShowEnvModal}
        environments={environments}
        onRefresh={fetchEnvironments}
      />
    </div>
  );
}
