import { useState } from "react";
import { Copy, Check, Lightning, Database, Timer, ArrowRight, ArrowSquareOut } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Highlight, themes } from "prism-react-renderer";
import { toast } from "sonner";

export function ResponseViewer({ response, isLoading, currentRequest, activeEnvironment }) {
  const [activeTab, setActiveTab] = useState("body");
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const copyToClipboard = async (text, setCopiedFn) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedFn(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedFn(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const buildCurl = () => {
    if (!currentRequest) return "";
    const method = currentRequest.method;
    const url = currentRequest.url;
    let cmd = `curl -X ${method} '${url}'`;
    (currentRequest.headers || []).filter((h) => h.enabled && h.key).forEach((h) => {
      cmd += ` \\\n  -H '${h.key}: ${h.value}'`;
    });
    if (currentRequest.auth?.type === "bearer" && currentRequest.auth.bearer_token) {
      cmd += ` \\\n  -H 'Authorization: Bearer ${currentRequest.auth.bearer_token}'`;
    }
    if (currentRequest.body && ["POST", "PUT", "PATCH"].includes(method)) {
      cmd += ` \\\n  -d '${currentRequest.body.replace(/'/g, "'\\''")}'`;
    }
    return cmd;
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getStatusClass = (code) => {
    if (code >= 200 && code < 300) return "status-2xx";
    if (code >= 300 && code < 400) return "status-3xx";
    if (code >= 400 && code < 500) return "status-4xx";
    return "status-5xx";
  };

  const getStatusText = (code) => {
    const t = { 200: "OK", 201: "Created", 204: "No Content", 301: "Moved Permanently", 302: "Found", 304: "Not Modified", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 408: "Request Timeout", 422: "Unprocessable Entity", 429: "Too Many Requests", 500: "Internal Server Error", 502: "Bad Gateway", 503: "Service Unavailable" };
    return t[code] || "";
  };

  const detectLanguage = (body, headers) => {
    const ct = headers?.["content-type"] || "";
    if (ct.includes("json") || body?.trim().startsWith("{") || body?.trim().startsWith("[")) return "json";
    if (ct.includes("xml") || body?.trim().startsWith("<")) return "xml";
    if (ct.includes("html")) return "html";
    return "text";
  };

  const formatBody = (body, language) => {
    if (language === "json") {
      try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
    }
    return body;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full bg-[#0c0c0d]">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="relative w-12 h-12 mx-auto mb-4">
              <div className="absolute inset-0 border-2 border-zinc-700 rounded-full"></div>
              <div className="absolute inset-0 border-2 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
            </div>
            <p className="text-sm text-zinc-500">Sending request...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex flex-col h-full bg-[#0c0c0d]">
        <div className="flex-1 flex items-center justify-center">
          <div className="empty-state">
            <Lightning size={48} className="text-zinc-700" />
            <p className="text-sm text-zinc-500">Enter a URL and click Send to get a response</p>
            <p className="text-xs text-zinc-600 mt-1">Ctrl+Enter to send quickly</p>
          </div>
        </div>
      </div>
    );
  }

  const language = detectLanguage(response.body, response.headers);
  const formattedBody = formatBody(response.body, language);

  return (
    <div className="flex flex-col h-full bg-[#0c0c0d]" data-testid="response-viewer">
      {/* Status Bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-[#09090b] flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-lg ${getStatusClass(response.status_code)}`} data-testid="response-status">
            {response.status_code}
          </span>
          <span className="text-sm text-zinc-500">{getStatusText(response.status_code)}</span>
        </div>

        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1" data-testid="response-time">
            <Timer size={13} />{response.response_time} ms
          </span>
          <span className="flex items-center gap-1" data-testid="response-size">
            <Database size={13} />{formatBytes(response.response_size)}
          </span>
          {response.redirect_count > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <ArrowRight size={13} />{response.redirect_count} redirect{response.redirect_count > 1 ? "s" : ""}
            </span>
          )}
          {response.final_url && response.final_url !== currentRequest?.url && (
            <a href={response.final_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-400 hover:text-blue-300 max-w-[200px] truncate" title={response.final_url}>
              <ArrowSquareOut size={13} />final URL
            </a>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(buildCurl(), setCopiedCurl)} className="h-7 px-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 text-xs">
            {copiedCurl ? <Check size={13} className="mr-1 text-green-500" /> : <Copy size={13} className="mr-1" />}cURL
          </Button>
          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(response.body, setCopied)} className="h-7 px-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" data-testid="copy-response-btn">
            {copied ? <Check size={14} className="mr-1 text-green-500" /> : <Copy size={14} className="mr-1" />}Copy
          </Button>
        </div>
      </div>

      {/* Response Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start gap-0 h-9 bg-transparent border-b border-zinc-800 rounded-none px-4">
          <TabsTrigger value="body" className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500" data-testid="response-body-tab">Body</TabsTrigger>
          <TabsTrigger value="headers" className="tab-trigger text-xs data-[state=active]:text-zinc-100 text-zinc-500" data-testid="response-headers-tab">
            Headers<span className="ml-1 text-[10px] text-zinc-600">({Object.keys(response.headers).length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="body" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="syntax-container m-4">
              <Highlight theme={themes.vsDark} code={formattedBody || ""} language={language === "text" ? "markup" : language}>
                {({ className, style, tokens, getLineProps, getTokenProps }) => (
                  <pre className={className} style={{ ...style, background: "#18181b", margin: 0, padding: "12px", fontSize: "13px", lineHeight: "1.5" }} data-testid="response-body">
                    {tokens.map((line, i) => (
                      <div key={i} {...getLineProps({ line })}>
                        <span className="text-zinc-600 select-none mr-4 text-right inline-block w-8">{i + 1}</span>
                        {line.map((token, key) => (<span key={key} {...getTokenProps({ token })} />))}
                      </div>
                    ))}
                  </pre>
                )}
              </Highlight>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="headers" className="flex-1 overflow-hidden m-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <table className="kv-table">
                <thead><tr><th>Header</th><th>Value</th></tr></thead>
                <tbody>
                  {Object.entries(response.headers).map(([key, value]) => (
                    <tr key={key}>
                      <td className="font-mono text-sm text-zinc-300">{key}</td>
                      <td className="font-mono text-sm text-zinc-400 break-all">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
