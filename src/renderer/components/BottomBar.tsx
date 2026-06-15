import { useState, useEffect } from "react";
import { Circle } from "lucide-react";

interface StatusDot {
  label: string;
  status: "online" | "offline" | "warning";
  detail?: string;
}

const STATUS_COLORS = {
  online: "#00ff88",
  offline: "#ff2244",
  warning: "#ffe600",
};

export function BottomBar() {
  const [userName, setUserName] = useState("operator");
  const [gatewayStatus, setGatewayStatus] = useState<"online" | "offline">("offline");
  const [savantStatus, setSavantStatus] = useState<"online" | "offline">("offline");
  const [defaultDir, setDefaultDir] = useState("~/code");
  const [dbStatus, setDbStatus] = useState<"connected" | "offline">("offline");

  useEffect(() => {
    const checkStatuses = async () => {
      let name = "operator";
      let dir = "~/code";
      let gUrl = "http://127.0.0.1:3100";
      let gEnabled = true;
      let sUrl = "http://127.0.0.1:8090";

      try {
        const settings = await window.system.getSettings();
        const osUser = await window.system.getUser().catch(() => "operator");
        name = settings["user:name"] || osUser || "operator";
        
        if (settings["system:defaultDirectory"]) {
          dir = settings["system:defaultDirectory"];
        }
        
        if (settings["gateway:config"]) {
          gUrl = settings["gateway:config"].url || gUrl;
          gEnabled = settings["gateway:config"].enabled !== false;
        }

        if (settings["server:config"]) {
          sUrl = settings["server:config"].url || sUrl;
        }
      } catch (e) {
        console.error("Failed to load settings in BottomBar:", e);
      }
      setUserName(name);
      setDefaultDir(dir);

      if (gEnabled) {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 1500);
          const res = await fetch(`${gUrl.replace(/\/$/, "")}/health`, { signal: controller.signal });
          clearTimeout(id);
          setGatewayStatus(res.ok ? "online" : "offline");
        } catch (e) {
          setGatewayStatus("offline");
        }
      } else {
        setGatewayStatus("offline");
      }

      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${sUrl.replace(/\/+$/, "")}/health/ready`, { signal: controller.signal });
        clearTimeout(id);
        setSavantStatus(res.ok ? "online" : "offline");
      } catch (e) {
        setSavantStatus("offline");
      }

      try {
        const status = await window.system.getDbStatus();
        setDbStatus(status === "connected" ? "connected" : "offline");
      } catch (e) {
        setDbStatus("offline");
      }
    };

    checkStatuses();
    const interval = setInterval(checkStatuses, 5000);
    return () => clearInterval(interval);
  }, []);

  const STATUS_ITEMS: StatusDot[] = [
    { label: "user", status: "online", detail: userName },
    { label: "gateway", status: gatewayStatus === "online" ? "online" : "offline", detail: gatewayStatus },
    { label: "savant", status: savantStatus === "online" ? "online" : "offline", detail: savantStatus },
    { label: "dir", status: "online", detail: defaultDir },
    { label: "db", status: dbStatus === "connected" ? "online" : "offline", detail: dbStatus },
  ];

  return (
    <footer
      style={{
        background: "var(--cp-bg-1)",
        borderTop: "1px solid var(--cp-border)",
        fontFamily: "'Share Tech Mono', monospace",
      }}
      className="flex items-center gap-0 h-7 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden"
    >
      {STATUS_ITEMS.map((item, i) => (
        <div
          key={item.label}
          style={{
            borderRight: "1px solid var(--cp-border)",
          }}
          className="flex items-center gap-1.5 px-3 h-full"
        >
          <Circle
            size={5}
            style={{
              color: STATUS_COLORS[item.status],
              fill: STATUS_COLORS[item.status],
              filter: `drop-shadow(0 0 3px ${STATUS_COLORS[item.status]})`,
            }}
          />
          <span style={{ color: "var(--muted-foreground)" }} className="text-xs opacity-50 whitespace-nowrap">
            {item.label}:
          </span>
          <span
            style={{
              color: item.status === "warning" ? "var(--cp-yellow)" : "var(--foreground)",
            }}
            className="text-xs opacity-60 whitespace-nowrap"
          >
            {item.detail}
          </span>
        </div>
      ))}

      {/* right: version + date + timestamp */}
      <div className="ml-auto px-3 flex items-center gap-3">
        <span style={{ color: "var(--cp-cyan)" }} className="text-xs opacity-20 font-bold whitespace-nowrap">
          v{APP_VERSION}
        </span>
        <span style={{ color: "var(--cp-cyan)" }} className="text-xs opacity-20 whitespace-nowrap">
          {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </span>
      </div>
    </footer>
  );
}
