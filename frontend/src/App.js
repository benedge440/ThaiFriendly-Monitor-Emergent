import { useState, useEffect, useCallback, useRef } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  WifiOff, 
  Settings, 
  Terminal, 
  RefreshCcw, 
  Play, 
  Square, 
  Shield, 
  Eye, 
  EyeOff,
  Trash2,
  Bell,
  BellOff,
  UserX,
  Clock
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { ScrollArea } from "./components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Status Hero Component - Now shows status text instead of just ONLINE/OFFLINE
const StatusHero = ({ statusText, lastChecked, targetUsername, isMonitoring, isCurrentlyOnline, userExists }) => {
  // Determine display based on status
  const getStatusDisplay = () => {
    if (!statusText || statusText === "Unknown") {
      return { text: "UNKNOWN", class: "text-[#888888]", pulseClass: "" };
    }
    if (!userExists || statusText === "User not found") {
      return { text: "USER NOT FOUND", class: "text-[#888888]", pulseClass: "" };
    }
    if (isCurrentlyOnline || statusText.toLowerCase() === "online now") {
      return { text: "ONLINE NOW", class: "text-[#00FF9C] glow-green", pulseClass: "animate-pulse-green" };
    }
    // Show the actual status text (e.g., "Online 2 days ago")
    return { text: statusText.toUpperCase(), class: "text-[#00F0FF] glow-cyan", pulseClass: "" };
  };

  const display = getStatusDisplay();
  
  return (
    <motion.div 
      className={`cyber-panel p-8 md:p-12 text-center relative ${display.pulseClass}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      data-testid="status-hero"
    >
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="relative z-10">
        <p className="text-xs uppercase tracking-[0.3em] text-[#888888] mb-2 font-mono" data-testid="monitoring-label">
          {isMonitoring ? "MONITORING ACTIVE" : "MONITORING PAUSED"}
        </p>
        <p className="text-sm md:text-base font-mono text-[#00F0FF] mb-4" data-testid="target-username">
          TARGET: {targetUsername}
        </p>
        <motion.h1 
          className={`text-3xl md:text-5xl lg:text-6xl font-bold font-mono ${display.class} glitch-text`}
          key={display.text}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          data-testid="status-indicator"
        >
          [ {display.text} ]
        </motion.h1>
        <p className="mt-6 text-sm text-[#888888] font-mono" data-testid="last-checked">
          {lastChecked ? `Last checked: ${new Date(lastChecked).toLocaleString()}` : "Not checked yet"}
        </p>
      </div>
    </motion.div>
  );
};

// Control Panel Component
const ControlPanel = ({ isMonitoring, onStart, onStop, onRefresh, isLoading }) => {
  return (
    <div className="cyber-panel p-6" data-testid="control-panel">
      <h2 className="text-sm uppercase tracking-[0.2em] text-[#888888] mb-4 font-mono flex items-center gap-2">
        <Shield className="w-4 h-4" />
        CONTROLS
      </h2>
      <div className="flex flex-col gap-3">
        {!isMonitoring ? (
          <Button
            onClick={onStart}
            disabled={isLoading}
            className="cyber-btn cyber-btn-primary w-full flex items-center justify-center gap-2"
            data-testid="start-btn"
          >
            <Play className="w-4 h-4" />
            START MONITORING
          </Button>
        ) : (
          <Button
            onClick={onStop}
            disabled={isLoading}
            className="cyber-btn cyber-btn-destructive w-full flex items-center justify-center gap-2"
            data-testid="stop-btn"
          >
            <Square className="w-4 h-4" />
            STOP MONITORING
          </Button>
        )}
        <Button
          onClick={onRefresh}
          disabled={isLoading}
          variant="outline"
          className="w-full flex items-center justify-center gap-2 border-[#262626] hover:border-[#00F0FF] hover:text-[#00F0FF] transition-colors"
          data-testid="refresh-btn"
        >
          <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          CHECK NOW
        </Button>
      </div>
    </div>
  );
};

// History Log Component - Updated to show status text
const HistoryLog = ({ history, onClear }) => {
  return (
    <div className="cyber-panel p-6 flex flex-col h-full" data-testid="history-panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm uppercase tracking-[0.2em] text-[#888888] font-mono flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          ACTIVITY LOG
        </h2>
        <Button
          onClick={onClear}
          variant="ghost"
          size="sm"
          className="text-[#888888] hover:text-[#FF2E2E] h-8 px-2"
          data-testid="clear-history-btn"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-[300px] max-h-[400px]">
        <div className="space-y-2 font-mono text-sm">
          <AnimatePresence>
            {history.length === 0 ? (
              <p className="text-[#888888] text-center py-8">No activity recorded yet</p>
            ) : (
              history.map((entry, index) => {
                // Determine icon and color based on status
                const isOnlineNow = entry.is_currently_online || entry.online_status?.toLowerCase() === "online now";
                const userNotFound = !entry.user_exists || entry.online_status === "User not found";
                
                let statusColor = "text-[#00F0FF]"; // Default cyan for "online X ago"
                let StatusIcon = Clock;
                
                if (userNotFound) {
                  statusColor = "text-[#888888]";
                  StatusIcon = UserX;
                } else if (isOnlineNow) {
                  statusColor = "text-[#00FF9C]";
                  StatusIcon = Activity;
                } else if (entry.online_status?.toLowerCase().includes("offline")) {
                  statusColor = "text-[#FF2E2E]";
                  StatusIcon = WifiOff;
                }
                
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ delay: index * 0.05 }}
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      entry.status_changed ? 'bg-[#151515]' : 'bg-transparent'
                    }`}
                    data-testid={`history-entry-${index}`}
                  >
                    <StatusIcon className={`w-4 h-4 mt-1 ${statusColor}`} />
                    <div className="flex-1 min-w-0">
                      <p className={statusColor}>
                        {entry.online_status || (entry.is_currently_online ? 'ONLINE' : 'OFFLINE')}
                        {entry.status_changed && (
                          <span className="ml-2 text-[#FF9500]">[CHANGED]</span>
                        )}
                      </p>
                      <p className="text-[#888888] text-xs mt-1">
                        {new Date(entry.checked_at).toLocaleString()}
                      </p>
                    </div>
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>
    </div>
  );
};

// Settings Panel Component
const SettingsPanel = ({ settings, onSave, isSaving }) => {
  const [formData, setFormData] = useState({
    thaifriendly_email: '',
    thaifriendly_password: '',
    target_username: 'MayimeTH',
    notification_email: '',
    check_interval_minutes: 10,
    session_cookie: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(prev => ({
        ...prev,
        thaifriendly_email: settings.thaifriendly_email || '',
        target_username: settings.target_username || 'MayimeTH',
        notification_email: settings.notification_email || '',
        check_interval_minutes: settings.check_interval_minutes || 10
      }));
    }
  }, [settings]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === 'granted');
      if (permission === 'granted') {
        toast.success('Browser notifications enabled!');
      } else {
        toast.error('Browser notifications denied');
      }
    }
  };

  return (
    <div className="cyber-panel p-6" data-testid="settings-panel">
      <h2 className="text-sm uppercase tracking-[0.2em] text-[#888888] mb-6 font-mono flex items-center gap-2">
        <Settings className="w-4 h-4" />
        CREDENTIALS VAULT
      </h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-[#888888]">
            ThaiFriendly Email
          </Label>
          <Input
            type="email"
            value={formData.thaifriendly_email}
            onChange={(e) => setFormData(prev => ({ ...prev, thaifriendly_email: e.target.value }))}
            placeholder="your@email.com"
            className="bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono"
            data-testid="tf-email-input"
          />
        </div>
        
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-[#888888]">
            ThaiFriendly Password
          </Label>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={formData.thaifriendly_password}
              onChange={(e) => setFormData(prev => ({ ...prev, thaifriendly_password: e.target.value }))}
              placeholder={settings?.has_password ? "••••••••" : "Enter password"}
              className="bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono pr-10"
              data-testid="tf-password-input"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#888888] hover:text-[#00F0FF] transition-colors"
              data-testid="toggle-password-btn"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-[#888888]">
            Target Username
          </Label>
          <Input
            type="text"
            value={formData.target_username}
            onChange={(e) => setFormData(prev => ({ ...prev, target_username: e.target.value }))}
            placeholder="MayimeTH"
            className="bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono"
            data-testid="target-username-input"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-[#888888]">
            Notification Email
          </Label>
          <Input
            type="email"
            value={formData.notification_email}
            onChange={(e) => setFormData(prev => ({ ...prev, notification_email: e.target.value }))}
            placeholder="notify@email.com"
            className="bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono"
            data-testid="notification-email-input"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-[#888888]">
            Check Interval (minutes)
          </Label>
          <Input
            type="number"
            min="1"
            max="60"
            value={formData.check_interval_minutes}
            onChange={(e) => setFormData(prev => ({ ...prev, check_interval_minutes: parseInt(e.target.value) || 10 }))}
            className="bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono"
            data-testid="interval-input"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-[#888888]">
            Session Cookie (PHPSESSID)
          </Label>
          <Input
            type="text"
            value={formData.session_cookie}
            onChange={(e) => setFormData(prev => ({ ...prev, session_cookie: e.target.value }))}
            placeholder={settings?.has_session_cookie ? "Cookie saved" : "Paste from browser"}
            className="bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono text-xs"
            data-testid="session-cookie-input"
          />
          <p className="text-[10px] text-[#888888] mt-1">
            Get from browser DevTools: F12 → Application → Cookies → PHPSESSID
          </p>
        </div>

        <div className="pt-4 space-y-3">
          <Button
            type="button"
            onClick={requestNotificationPermission}
            variant="outline"
            className="w-full flex items-center justify-center gap-2 border-[#262626] hover:border-[#00F0FF]"
            data-testid="enable-notifications-btn"
          >
            {notificationsEnabled ? (
              <>
                <Bell className="w-4 h-4 text-[#00FF9C]" />
                <span className="text-[#00FF9C]">Browser Notifications Enabled</span>
              </>
            ) : (
              <>
                <BellOff className="w-4 h-4" />
                Enable Browser Notifications
              </>
            )}
          </Button>
          
          <Button
            type="submit"
            disabled={isSaving}
            className="cyber-btn cyber-btn-primary w-full"
            data-testid="save-settings-btn"
          >
            {isSaving ? 'SAVING...' : 'SAVE CREDENTIALS'}
          </Button>
        </div>
      </form>
    </div>
  );
};

// Main App Component
function App() {
  const [settings, setSettings] = useState(null);
  const [history, setHistory] = useState([]);
  const [monitoringStatus, setMonitoringStatus] = useState({
    is_monitoring: false,
    current_status: null,
    is_currently_online: false,
    last_checked: null,
    target_username: 'MayimeTH',
    user_exists: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setSettings(response.data);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  }, []);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/history`);
      setHistory(response.data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, []);

  // Fetch monitoring status
  const fetchMonitoringStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/monitoring/status`);
      setMonitoringStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch monitoring status:', error);
    }
  }, []);

  // Connect WebSocket
  const connectWebSocket = useCallback(() => {
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    
    try {
      wsRef.current = new WebSocket(`${wsUrl}/api/ws`);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
      };
      
      wsRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'status_update') {
          setMonitoringStatus(prev => ({
            ...prev,
            current_status: data.online_status,
            is_currently_online: data.is_currently_online,
            last_checked: data.last_checked,
            target_username: data.target_username,
            user_exists: data.user_exists
          }));
          fetchHistory();
          
          // Show toast for status change
          if (data.status_changed && data.user_exists) {
            if (data.is_currently_online) {
              toast.success(`${data.target_username} is now ONLINE!`, {
                duration: 10000,
              });
              // Browser notification
              if (Notification.permission === 'granted') {
                new Notification('NetSentinel Alert', {
                  body: `${data.target_username} is now ONLINE!`,
                  icon: '/favicon.ico'
                });
              }
            } else {
              toast.info(`${data.target_username}: ${data.online_status}`);
            }
          }
        } else if (data.type === 'notification') {
          toast.success(data.message, { duration: 15000 });
          if (Notification.permission === 'granted') {
            new Notification('NetSentinel Alert', {
              body: data.message,
              icon: '/favicon.ico'
            });
          }
        } else if (data.type === 'connection') {
          setMonitoringStatus(prev => ({
            ...prev,
            is_monitoring: data.is_monitoring,
            current_status: data.current_status,
            last_checked: data.last_checked
          }));
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        reconnectTimeoutRef.current = setTimeout(connectWebSocket, 5000);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }, [fetchHistory]);

  // Initial data fetch
  useEffect(() => {
    fetchSettings();
    fetchHistory();
    fetchMonitoringStatus();
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchSettings, fetchHistory, fetchMonitoringStatus, connectWebSocket]);

  // Save settings
  const handleSaveSettings = async (formData) => {
    setIsSaving(true);
    try {
      await axios.put(`${API}/settings`, formData);
      toast.success('Settings saved successfully!');
      fetchSettings();
    } catch (error) {
      toast.error('Failed to save settings');
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Start monitoring
  const handleStartMonitoring = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/monitoring/start`);
      setMonitoringStatus(prev => ({ ...prev, is_monitoring: true }));
      toast.success(response.data.message);
      fetchHistory();
      fetchMonitoringStatus();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to start monitoring');
    } finally {
      setIsLoading(false);
    }
  };

  // Stop monitoring
  const handleStopMonitoring = async () => {
    setIsLoading(true);
    try {
      await axios.post(`${API}/monitoring/stop`);
      setMonitoringStatus(prev => ({ ...prev, is_monitoring: false }));
      toast.info('Monitoring stopped');
    } catch (error) {
      toast.error('Failed to stop monitoring');
    } finally {
      setIsLoading(false);
    }
  };

  // Check now
  const handleCheckNow = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/monitoring/check-now`);
      setMonitoringStatus(prev => ({
        ...prev,
        current_status: response.data.online_status,
        last_checked: response.data.last_checked
      }));
      fetchHistory();
      toast.success('Status checked!');
    } catch (error) {
      toast.error('Failed to check status');
    } finally {
      setIsLoading(false);
    }
  };

  // Clear history
  const handleClearHistory = async () => {
    try {
      await axios.delete(`${API}/history`);
      setHistory([]);
      toast.success('History cleared');
    } catch (error) {
      toast.error('Failed to clear history');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] grid-bg scanlines" data-testid="app-container">
      <Toaster 
        position="top-right" 
        theme="dark"
        toastOptions={{
          style: {
            background: '#0A0A0A',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#EDEDED'
          }
        }}
      />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <motion.header 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl md:text-3xl font-bold font-mono text-[#00F0FF] glow-cyan tracking-wider" data-testid="app-title">
            NETSENTINEL
          </h1>
          <p className="text-[#888888] text-sm mt-2 font-mono">ThaiFriendly User Monitor v1.0</p>
        </motion.header>

        {/* Main Content - Tabs for mobile */}
        <div className="md:hidden">
          <Tabs defaultValue="status" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-[#0A0A0A] border border-[#262626]">
              <TabsTrigger value="status" className="data-[state=active]:bg-[#151515] data-[state=active]:text-[#00FF9C]">
                <Activity className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="history" className="data-[state=active]:bg-[#151515] data-[state=active]:text-[#00FF9C]">
                <Terminal className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-[#151515] data-[state=active]:text-[#00FF9C]">
                <Settings className="w-4 h-4" />
              </TabsTrigger>
            </TabsList>
            <TabsContent value="status" className="mt-4 space-y-4">
              <StatusHero 
                statusText={monitoringStatus.current_status}
                lastChecked={monitoringStatus.last_checked}
                targetUsername={monitoringStatus.target_username}
                isMonitoring={monitoringStatus.is_monitoring}
                isCurrentlyOnline={monitoringStatus.is_currently_online}
                userExists={monitoringStatus.user_exists}
              />
              <ControlPanel 
                isMonitoring={monitoringStatus.is_monitoring}
                onStart={handleStartMonitoring}
                onStop={handleStopMonitoring}
                onRefresh={handleCheckNow}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <HistoryLog history={history} onClear={handleClearHistory} />
            </TabsContent>
            <TabsContent value="settings" className="mt-4">
              <SettingsPanel 
                settings={settings}
                onSave={handleSaveSettings}
                isSaving={isSaving}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Content - Grid for desktop */}
        <div className="hidden md:grid grid-cols-12 gap-4">
          {/* Status Hero - Large */}
          <div className="col-span-8">
            <StatusHero 
              statusText={monitoringStatus.current_status}
              lastChecked={monitoringStatus.last_checked}
              targetUsername={monitoringStatus.target_username}
              isMonitoring={monitoringStatus.is_monitoring}
              isCurrentlyOnline={monitoringStatus.is_currently_online}
              userExists={monitoringStatus.user_exists}
            />
          </div>
          
          {/* Controls */}
          <div className="col-span-4">
            <ControlPanel 
              isMonitoring={monitoringStatus.is_monitoring}
              onStart={handleStartMonitoring}
              onStop={handleStopMonitoring}
              onRefresh={handleCheckNow}
              isLoading={isLoading}
            />
          </div>
          
          {/* History Log */}
          <div className="col-span-8">
            <HistoryLog history={history} onClear={handleClearHistory} />
          </div>
          
          {/* Settings */}
          <div className="col-span-4">
            <SettingsPanel 
              settings={settings}
              onSave={handleSaveSettings}
              isSaving={isSaving}
            />
          </div>
        </div>

        {/* Footer */}
        <motion.footer 
          className="text-center mt-8 text-[#888888] text-xs font-mono"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p>Secure monitoring system • Encrypted credentials</p>
        </motion.footer>
      </div>
    </div>
  );
}

export default App;
