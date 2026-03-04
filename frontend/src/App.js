import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Clock,
  Search,
  Filter,
  User
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { ScrollArea } from "./components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Session Health Indicator Component
const SessionHealthIndicator = ({ sessionHealth }) => {
  const getHealthDisplay = () => {
    if (!sessionHealth || sessionHealth.status === "unknown") {
      return { 
        text: "UNKNOWN", 
        color: "text-[#888888]", 
        bgColor: "bg-[#888888]/10",
        borderColor: "border-[#888888]/30"
      };
    }
    if (sessionHealth.status === "active") {
      const lastSuccess = sessionHealth.last_success ? new Date(sessionHealth.last_success) : null;
      const timeSince = lastSuccess ? Math.round((Date.now() - lastSuccess.getTime()) / 60000) : null;
      return { 
        text: timeSince !== null ? `ACTIVE (${timeSince}m ago)` : "ACTIVE", 
        color: "text-[#00FF9C]", 
        bgColor: "bg-[#00FF9C]/10",
        borderColor: "border-[#00FF9C]/30"
      };
    }
    return { 
      text: "EXPIRED", 
      color: "text-[#FF2E2E]", 
      bgColor: "bg-[#FF2E2E]/10",
      borderColor: "border-[#FF2E2E]/30",
      warning: "Please refresh your PHPSESSID cookie"
    };
  };

  const display = getHealthDisplay();

  return (
    <div 
      className={`${display.bgColor} border ${display.borderColor} rounded-lg p-3 font-mono`}
      data-testid="session-health-indicator"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className={`w-4 h-4 ${display.color}`} />
          <span className="text-xs text-[#888888] uppercase tracking-wider">Session</span>
        </div>
        <span className={`text-xs font-bold ${display.color}`}>{display.text}</span>
      </div>
      {display.warning && (
        <p className="mt-2 text-[10px] text-[#FF9500] animate-pulse">
          ⚠️ {display.warning}
        </p>
      )}
    </div>
  );
};

// Status Hero Component - Shows status for each tracked user
const StatusHero = ({ userStatuses, lastChecked, targetUsernames, isMonitoring, sessionHealth }) => {
  const userCount = targetUsernames?.length || 0;
  
  // Helper to get display properties for a status
  const getStatusStyle = (status) => {
    if (!status || status === "Unknown" || status === "Status unknown") {
      return { color: "text-[#888888]", icon: Clock };
    }
    if (status === "Session expired" || status === "Login required") {
      return { color: "text-[#FF9500]", icon: WifiOff };
    }
    if (status === "User not found") {
      return { color: "text-[#888888]", icon: UserX };
    }
    if (status.toLowerCase() === "online now") {
      return { color: "text-[#00FF9C]", icon: Activity, pulse: true };
    }
    // Offline with time
    return { color: "text-[#FF2E2E]", icon: WifiOff };
  };

  // Check if any user is online
  const anyOnline = userStatuses && Object.values(userStatuses).some(
    s => s?.status?.toLowerCase() === "online now"
  );
  
  return (
    <motion.div 
      className={`cyber-panel p-6 md:p-8 relative ${anyOnline ? 'animate-pulse-green' : ''}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      data-testid="status-hero"
    >
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="relative z-10">
        {/* Header */}
        <div className="text-center mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-[#888888] mb-2 font-mono" data-testid="monitoring-label">
            {isMonitoring ? "MONITORING ACTIVE" : "MONITORING PAUSED"}
          </p>
          <p className="text-sm font-mono text-[#00F0FF]" data-testid="user-count">
            TRACKING {userCount} USER{userCount !== 1 ? 'S' : ''}
          </p>
        </div>

        {/* User Status Grid */}
        {userCount > 0 ? (
          <div className={`grid gap-3 ${userCount === 1 ? 'grid-cols-1' : userCount === 2 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
            {targetUsernames.map((username) => {
              const userStatus = userStatuses?.[username];
              const status = userStatus?.status || "Unknown";
              const style = getStatusStyle(status);
              const StatusIcon = style.icon;
              
              return (
                <motion.div
                  key={username}
                  className={`bg-[#0A0A0A] border border-[#262626] rounded-lg p-4 ${style.pulse ? 'shadow-neon-green' : ''}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  data-testid={`user-status-${username}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <User className="w-4 h-4 text-[#00F0FF]" />
                    <span className="font-mono text-sm text-[#00F0FF] truncate">{username}</span>
                  </div>
                  <div className={`flex items-center gap-2 ${style.color}`}>
                    <StatusIcon className={`w-5 h-5 ${style.pulse ? 'animate-pulse' : ''}`} />
                    <span className="font-mono text-sm font-bold uppercase">
                      {status}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-[#888888] font-mono">No users configured</p>
          </div>
        )}

        {/* Last Checked */}
        <p className="mt-6 text-center text-xs text-[#888888] font-mono" data-testid="last-checked">
          {lastChecked ? `Last checked: ${new Date(lastChecked).toLocaleString()}` : "Not checked yet"}
        </p>
        
        {/* Session Health */}
        <div className="mt-4">
          <SessionHealthIndicator sessionHealth={sessionHealth} />
        </div>
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

// History Log Component - Enhanced with filtering, search, and username display
const HistoryLog = ({ history, onClear }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Get unique usernames from history for reference
  const uniqueUsernames = useMemo(() => {
    const usernames = new Set(history.map(h => h.target_username).filter(Boolean));
    return Array.from(usernames);
  }, [history]);
  
  // Filter and search history
  const filteredHistory = useMemo(() => {
    return history.filter(entry => {
      // Search filter - by username
      const matchesSearch = searchQuery === '' || 
        entry.target_username?.toLowerCase().includes(searchQuery.toLowerCase());
      
      // Status filter
      let matchesStatus = true;
      if (statusFilter !== 'all') {
        const status = entry.online_status?.toLowerCase() || '';
        const isOnline = entry.is_currently_online || status === 'online now';
        const isOffline = status.includes('offline');
        const isUnknown = status === 'unknown' || status === 'status unknown';
        
        switch (statusFilter) {
          case 'online':
            matchesStatus = isOnline;
            break;
          case 'offline':
            matchesStatus = isOffline;
            break;
          case 'unknown':
            matchesStatus = isUnknown;
            break;
          default:
            matchesStatus = true;
        }
      }
      
      return matchesSearch && matchesStatus;
    });
  }, [history, searchQuery, statusFilter]);
  
  return (
    <div className="cyber-panel p-6 flex flex-col h-full" data-testid="history-panel">
      {/* Header */}
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
      
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888888]" />
          <Input
            type="text"
            placeholder="Search username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono text-sm h-9"
            data-testid="history-search-input"
          />
        </div>
        
        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger 
            className="w-full sm:w-[140px] bg-black border-[#262626] font-mono text-sm h-9"
            data-testid="status-filter-select"
          >
            <Filter className="w-3 h-3 mr-2 text-[#888888]" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent className="bg-[#0A0A0A] border-[#262626]">
            <SelectItem value="all" className="font-mono text-sm">All Status</SelectItem>
            <SelectItem value="online" className="font-mono text-sm text-[#00FF9C]">Online</SelectItem>
            <SelectItem value="offline" className="font-mono text-sm text-[#FF2E2E]">Offline</SelectItem>
            <SelectItem value="unknown" className="font-mono text-sm text-[#888888]">Unknown</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      {/* Results count */}
      {(searchQuery || statusFilter !== 'all') && (
        <p className="text-[10px] text-[#888888] mb-2 font-mono">
          Showing {filteredHistory.length} of {history.length} entries
          {uniqueUsernames.length > 1 && ` • ${uniqueUsernames.length} users tracked`}
        </p>
      )}
      
      {/* History List - Using native scroll for mobile compatibility */}
      <div 
        className="flex-1 min-h-[250px] max-h-[350px] overflow-y-auto overscroll-contain"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <div className="space-y-2 font-mono text-sm pr-2">
          <AnimatePresence>
            {filteredHistory.length === 0 ? (
              <p className="text-[#888888] text-center py-8">
                {history.length === 0 ? 'No activity recorded yet' : 'No matching entries found'}
              </p>
            ) : (
              filteredHistory.map((entry, index) => {
                // Determine icon and color based on status
                const isOnlineNow = entry.is_currently_online || entry.online_status?.toLowerCase() === "online now";
                const userNotFound = !entry.user_exists || entry.online_status === "User not found";
                
                let statusColor = "text-[#00F0FF]"; // Default cyan for "offline X ago"
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
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                    className={`flex items-start gap-3 p-3 rounded-lg ${
                      entry.status_changed ? 'bg-[#151515]' : 'bg-transparent'
                    }`}
                    data-testid={`history-entry-${index}`}
                  >
                    <StatusIcon className={`w-4 h-4 mt-1 ${statusColor}`} />
                    <div className="flex-1 min-w-0">
                      {/* Username */}
                      <p className="text-[#00F0FF] text-xs flex items-center gap-1 mb-1">
                        <User className="w-3 h-3" />
                        {entry.target_username || 'Unknown User'}
                      </p>
                      {/* Status */}
                      <p className={statusColor}>
                        {entry.online_status || (entry.is_currently_online ? 'ONLINE' : 'OFFLINE')}
                        {entry.status_changed && (
                          <span className="ml-2 text-[#FF9500]">[CHANGED]</span>
                        )}
                      </p>
                      {/* Timestamp */}
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
      </div>
    </div>
  );
};

// Settings Panel Component
const SettingsPanel = ({ settings, onSave, isSaving }) => {
  const [formData, setFormData] = useState({
    thaifriendly_email: '',
    thaifriendly_password: '',
    target_usernames: ['MayimeTH'],
    notification_email: '',
    check_interval_minutes: 10,
    session_cookie: ''
  });
  const [newUsername, setNewUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    if (settings) {
      setFormData(prev => ({
        ...prev,
        thaifriendly_email: settings.thaifriendly_email || '',
        target_usernames: settings.target_usernames?.length > 0 
          ? settings.target_usernames 
          : [settings.target_username || 'MayimeTH'],
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

  const addUsername = () => {
    const trimmed = newUsername.trim();
    if (trimmed && !formData.target_usernames.includes(trimmed)) {
      setFormData(prev => ({
        ...prev,
        target_usernames: [...prev.target_usernames, trimmed]
      }));
      setNewUsername('');
    }
  };

  const removeUsername = (usernameToRemove) => {
    setFormData(prev => ({
      ...prev,
      target_usernames: prev.target_usernames.filter(u => u !== usernameToRemove)
    }));
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

        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wider text-[#888888]">
            Target Usernames ({formData.target_usernames.length})
          </Label>
          
          {/* Current usernames list */}
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {formData.target_usernames.map((username, idx) => (
              <div 
                key={username} 
                className="flex items-center justify-between bg-[#0A0A0A] border border-[#262626] rounded px-3 py-2"
              >
                <span className="text-sm font-mono text-[#00F0FF]">
                  <User className="w-3 h-3 inline mr-2" />
                  {username}
                </span>
                <button
                  type="button"
                  onClick={() => removeUsername(username)}
                  className="text-[#888888] hover:text-[#FF2E2E] transition-colors"
                  data-testid={`remove-username-${idx}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          
          {/* Add new username */}
          <div className="flex gap-2">
            <Input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUsername())}
              placeholder="Add username..."
              className="flex-1 bg-black border-0 border-b border-[#262626] rounded-none focus:border-[#00F0FF] font-mono text-sm h-9"
              data-testid="new-username-input"
            />
            <Button
              type="button"
              onClick={addUsername}
              variant="outline"
              size="sm"
              className="border-[#262626] hover:border-[#00FF9C] hover:text-[#00FF9C] h-9 px-3"
              data-testid="add-username-btn"
            >
              + Add
            </Button>
          </div>
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
  const [userStatuses, setUserStatuses] = useState({});  // Per-user status tracking
  const [sessionHealth, setSessionHealth] = useState({ status: "unknown" });
  const [monitoringStatus, setMonitoringStatus] = useState({
    is_monitoring: false,
    last_checked: null,
    target_usernames: []
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Fetch session health
  const fetchSessionHealth = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/session/health`);
      setSessionHealth(response.data);
    } catch (error) {
      console.error('Failed to fetch session health:', error);
    }
  }, []);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/settings`);
      setSettings(response.data);
      // Update target usernames in monitoring status
      setMonitoringStatus(prev => ({
        ...prev,
        target_usernames: response.data.target_usernames || [response.data.target_username]
      }));
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    }
  }, []);

  // Fetch history and derive per-user statuses
  const fetchHistory = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/history`);
      setHistory(response.data);
      
      // Derive per-user statuses from history (most recent status per user)
      const statuses = {};
      response.data.forEach(entry => {
        const username = entry.target_username;
        if (username && !statuses[username]) {
          statuses[username] = {
            status: entry.online_status,
            is_online: entry.is_currently_online,
            checked_at: entry.checked_at,
            user_exists: entry.user_exists
          };
        }
      });
      setUserStatuses(statuses);
      
      // Update last_checked from most recent entry
      if (response.data.length > 0) {
        setMonitoringStatus(prev => ({
          ...prev,
          last_checked: response.data[0].checked_at
        }));
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  }, []);

  // Fetch monitoring status
  const fetchMonitoringStatus = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/monitoring/status`);
      setMonitoringStatus(prev => ({
        ...prev,
        is_monitoring: response.data.is_monitoring,
        last_checked: response.data.last_checked || prev.last_checked
      }));
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
          // Update per-user status
          if (data.target_username) {
            setUserStatuses(prev => ({
              ...prev,
              [data.target_username]: {
                status: data.online_status,
                is_online: data.is_currently_online,
                checked_at: data.last_checked,
                user_exists: data.user_exists
              }
            }));
          }
          
          setMonitoringStatus(prev => ({
            ...prev,
            last_checked: data.last_checked
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
        } else if (data.type === 'session_health') {
          setSessionHealth(data);
          if (data.status === 'expired') {
            toast.error('Session expired! Please refresh your cookie.', { duration: 30000 });
          }
        } else if (data.type === 'connection') {
          setMonitoringStatus(prev => ({
            ...prev,
            is_monitoring: data.is_monitoring,
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
    fetchSessionHealth();
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchSettings, fetchHistory, fetchMonitoringStatus, fetchSessionHealth, connectWebSocket]);

  // Periodically refresh session health indicator
  useEffect(() => {
    const interval = setInterval(() => {
      if (sessionHealth.status === 'active') {
        // Force re-render to update "X min ago"
        setSessionHealth(prev => ({ ...prev }));
      }
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [sessionHealth.status]);

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
                userStatuses={userStatuses}
                lastChecked={monitoringStatus.last_checked}
                targetUsernames={monitoringStatus.target_usernames}
                isMonitoring={monitoringStatus.is_monitoring}
                sessionHealth={sessionHealth}
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
              userStatuses={userStatuses}
              lastChecked={monitoringStatus.last_checked}
              targetUsernames={monitoringStatus.target_usernames}
              isMonitoring={monitoringStatus.is_monitoring}
              sessionHealth={sessionHealth}
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
