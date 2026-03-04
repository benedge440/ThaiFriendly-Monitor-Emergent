from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import re
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import asyncio
from bs4 import BeautifulSoup
import resend
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from cryptography.fernet import Fernet
import base64
import hashlib
from playwright.async_api import async_playwright

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Resend API key
resend_api_key = os.environ.get('RESEND_API_KEY', '')
if resend_api_key:
    resend.api_key = resend_api_key

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Encryption key for credentials
SECRET_KEY = os.environ.get('SECRET_KEY', 'netsentinel-secret-key-2024')
key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
cipher = Fernet(key)

# Global state
scheduler = AsyncIOScheduler()
monitoring_active = False
current_status_text = None
last_checked = None
connected_websockets: List[WebSocket] = []

# Session health tracking
session_health = {
    "status": "unknown",  # "active", "expired", "unknown"
    "last_success": None,
    "last_failure": None,
    "failure_reason": None
}

# Models
class Settings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    thaifriendly_email: str = ""
    thaifriendly_password_encrypted: str = ""
    target_username: str = "MayimeTH"  # Keep for backward compat
    target_usernames: List[str] = Field(default_factory=lambda: ["MayimeTH"])
    notification_email: str = ""
    check_interval_minutes: int = 10
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SettingsUpdate(BaseModel):
    thaifriendly_email: Optional[str] = None
    thaifriendly_password: Optional[str] = None
    target_username: Optional[str] = None  # Keep for backward compat
    target_usernames: Optional[List[str]] = None
    notification_email: Optional[str] = None
    check_interval_minutes: Optional[int] = None
    session_cookie: Optional[str] = None  # PHPSESSID cookie from browser

class SettingsResponse(BaseModel):
    id: str
    thaifriendly_email: str
    has_password: bool
    target_username: str  # Primary/first username for backward compat
    target_usernames: List[str] = []
    notification_email: str
    check_interval_minutes: int
    has_session_cookie: bool = False

class StatusHistoryResponse(BaseModel):
    id: str
    target_username: str
    online_status: str
    is_currently_online: bool
    checked_at: str
    status_changed: bool
    user_exists: bool

class MonitoringStatus(BaseModel):
    is_monitoring: bool
    current_status: Optional[str] = None
    is_currently_online: bool = False
    last_checked: Optional[str] = None
    target_username: str = "MayimeTH"
    user_exists: bool = True

class SessionHealth(BaseModel):
    status: str  # "active", "expired", "unknown"
    last_success: Optional[str] = None
    last_failure: Optional[str] = None
    failure_reason: Optional[str] = None

# Helper functions
def encrypt_password(password: str) -> str:
    return cipher.encrypt(password.encode()).decode()

def decrypt_password(encrypted: str) -> str:
    return cipher.decrypt(encrypted.encode()).decode()

async def broadcast_status(data: dict):
    """Broadcast status to all connected WebSocket clients"""
    disconnected = []
    for ws in connected_websockets:
        try:
            await ws.send_json(data)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        connected_websockets.remove(ws)

async def send_email_notification(status_text: str, username: str, notification_email: str, is_online_now: bool):
    """Send email notification when user comes online"""
    if not resend_api_key or not notification_email:
        logger.warning("Email notification skipped: No API key or notification email configured")
        return
    
    status_color = "#00FF9C" if is_online_now else "#00F0FF"
    
    html_content = f"""
    <div style="font-family: 'Courier New', monospace; background-color: #050505; color: #EDEDED; padding: 40px; text-align: center;">
        <h1 style="color: {status_color}; font-size: 36px; margin: 0;">[ {status_text.upper()} ]</h1>
        <p style="font-size: 24px; margin-top: 20px;">User <strong>{username}</strong></p>
        <p style="color: #888888; font-size: 14px; margin-top: 30px;">NetSentinel Monitor • {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
    </div>
    """
    
    try:
        params = {
            "from": os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev'),
            "to": [notification_email],
            "subject": f"🔔 {username}: {status_text} on ThaiFriendly",
            "html": html_content
        }
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email notification sent: {email}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")

def parse_online_status(soup: BeautifulSoup, page_text: str) -> dict:
    """
    Parse the online status from a ThaiFriendly profile page.
    Returns dict with: online_status (text), is_currently_online (bool), user_exists (bool)
    """
    result = {
        "online_status": "Unknown",
        "is_currently_online": False,
        "user_exists": True
    }
    
    page_text_lower = page_text.lower()
    html_str = str(soup).lower()
    
    # Check if user doesn't exist
    not_found_indicators = [
        "profile not found",
        "user not found", 
        "page not found",
        "doesn't exist",
        "member not found",
        "no results",
        "join thaifriendly to see"
    ]
    
    for indicator in not_found_indicators:
        if indicator in page_text_lower:
            result["user_exists"] = False
            result["online_status"] = "User not found"
            return result
    
    # Look for "Online now" pattern
    online_now_patterns = [
        r'online\s*now',
        r'currently\s*online',
        r'active\s*now',
        r'online\s*$'  # Just "Online" at end of line
    ]
    
    for pattern in online_now_patterns:
        if re.search(pattern, page_text_lower):
            result["online_status"] = "Online now"
            result["is_currently_online"] = True
            return result
    
    # Look for "Online X ago" pattern - THIS IS THE KEY PATTERN
    # Patterns like: "Online 2 days ago", "Last seen 5 hours ago"
    time_ago_patterns = [
        r'(?:online|last\s*(?:seen|active))\s*[:\s]*(\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago)',
        r'(\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago)',
    ]
    
    for pattern in time_ago_patterns:
        match = re.search(pattern, page_text_lower)
        if match:
            time_text = match.group(1)
            result["online_status"] = f"Online {time_text}"
            result["is_currently_online"] = False
            return result
    
    # Check HTML for online status elements
    status_elements = soup.find_all(class_=lambda x: x and ('online' in str(x).lower() or 'status' in str(x).lower() or 'last-seen' in str(x).lower()) if x else False)
    for elem in status_elements:
        elem_text = elem.get_text(strip=True)
        if elem_text and len(elem_text) < 100:
            # Check if contains time ago
            if 'ago' in elem_text.lower():
                result["online_status"] = elem_text
                result["is_currently_online"] = False
                return result
            elif 'online' in elem_text.lower() and 'now' in elem_text.lower():
                result["online_status"] = "Online now"
                result["is_currently_online"] = True
                return result
    
    # Look for any span/div containing online info
    for elem in soup.find_all(['span', 'div', 'p', 'small']):
        text = elem.get_text(strip=True).lower()
        if 'online' in text and len(text) < 50:
            if 'ago' in text:
                result["online_status"] = elem.get_text(strip=True)
                return result
            elif text in ['online', 'online now']:
                result["online_status"] = "Online now"
                result["is_currently_online"] = True
                return result
    
    return result

async def check_thaifriendly_status(email: str, password: str, target_username: str, session_cookie: str = None) -> dict:
    """
    Check target user's online status on ThaiFriendly using Playwright.
    Uses session cookie for authentication.
    """
    global current_status_text, last_checked
    
    result = {
        "online_status": "Error",
        "is_currently_online": False,
        "user_exists": False,
        "error": None
    }
    
    if not session_cookie:
        result["error"] = "Session cookie required - please login to ThaiFriendly in your browser and provide the PHPSESSID cookie"
        result["online_status"] = "Login required"
        return result
    
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1920, "height": 1080})
            
            # Set the session cookie
            await context.add_cookies([{
                "name": "PHPSESSID",
                "value": session_cookie,
                "domain": ".thaifriendly.com",
                "path": "/"
            }])
            
            page = await context.new_page()
            
            logger.info(f"Fetching profile for {target_username} with Playwright...")
            
            try:
                await page.goto(f"https://www.thaifriendly.com/{target_username}", wait_until="networkidle", timeout=30000)
                await asyncio.sleep(3)  # Wait for dynamic content
            except Exception as e:
                logger.error(f"Navigation failed: {e}")
                result["error"] = f"Failed to load profile: {str(e)}"
                await browser.close()
                return result
            
            # Get page text after JavaScript execution
            page_text = await page.inner_text("body")
            
            logger.info(f"Page text preview: {page_text[:500]}")
            
            # Check if user not found or need login
            page_text_lower = page_text.lower()
            
            if "join thaifriendly" in page_text_lower and target_username.lower() not in page_text_lower:
                result["error"] = "Session expired - please get a new PHPSESSID cookie from your browser"
                result["online_status"] = "Session expired"
                await browser.close()
                return result
            
            # Check for explicit "user deleted/does not exist/blocked" message
            if "this user has been deleted" in page_text_lower or "this profile does not exist" in page_text_lower or "has blocked you" in page_text_lower:
                result["user_exists"] = False
                result["online_status"] = "User not found"
                await browser.close()
                return result
            
            # Check if target username is on the page
            if target_username.lower() not in page_text_lower:
                result["user_exists"] = False
                result["online_status"] = "User not found"
                await browser.close()
                return result
            
            result["user_exists"] = True
            
            # Look for "Online now" or "Offline (X ago)" patterns
            # ThaiFriendly format: "Offline (2 day ago)" or "Online"
            
            # Check for "Online now" or just "Online" status
            online_now_match = re.search(r'\b(online)\b(?!\s*\()', page_text_lower)
            if online_now_match:
                # Make sure it's the user's status, not just text
                context_match = re.search(rf'{target_username.lower()}.*?\b(online)\b', page_text_lower, re.DOTALL)
                if context_match:
                    result["online_status"] = "Online now"
                    result["is_currently_online"] = True
                    last_checked = datetime.now(timezone.utc).isoformat()
                    current_status_text = result["online_status"]
                    await browser.close()
                    return result
            
            # Check for "Offline (X day/hour/minute ago)"
            offline_match = re.search(r'offline\s*\((\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago)\)', page_text_lower)
            if offline_match:
                time_ago = offline_match.group(1)
                result["online_status"] = f"Offline ({time_ago})"
                result["is_currently_online"] = False
                last_checked = datetime.now(timezone.utc).isoformat()
                current_status_text = result["online_status"]
                await browser.close()
                return result
            
            # Alternative: Look for "Last Active: X ago"
            last_active_match = re.search(r'last\s*active[:\s]*(\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*ago)', page_text_lower)
            if last_active_match:
                time_ago = last_active_match.group(1)
                result["online_status"] = f"Last active {time_ago}"
                result["is_currently_online"] = False
                last_checked = datetime.now(timezone.utc).isoformat()
                current_status_text = result["online_status"]
                await browser.close()
                return result
            
            # If we found the user but couldn't determine status
            result["online_status"] = "Status unknown"
            last_checked = datetime.now(timezone.utc).isoformat()
            current_status_text = result["online_status"]
            
            await browser.close()
            return result
            
    except Exception as e:
        logger.error(f"Error checking ThaiFriendly status: {e}")
        result["error"] = str(e)
        return result

async def check_single_user(session_cookie: str, target_username: str, notification_email: str, email: str = "", password: str = ""):
    """Check status for a single user and record to history"""
    global current_status_text, last_checked, session_health
    
    # Get previous status for this user
    last_history = await db.status_history.find_one(
        {"target_username": target_username},
        {"_id": 0},
        sort=[("checked_at", -1)]
    )
    previous_status = last_history.get('online_status') if last_history else None
    previous_is_online = last_history.get('is_currently_online', False) if last_history else False
    
    # Check current status
    status_result = await check_thaifriendly_status(email, password, target_username, session_cookie)
    
    checked_at = datetime.now(timezone.utc).isoformat()
    
    # Update session health based on result
    if status_result.get("error"):
        error_msg = status_result.get("error", "")
        if "session expired" in error_msg.lower() or "login required" in error_msg.lower():
            session_health["status"] = "expired"
            session_health["last_failure"] = checked_at
            session_health["failure_reason"] = error_msg
            # Broadcast session expired
            await broadcast_status({
                "type": "session_health",
                "status": "expired",
                "last_failure": checked_at,
                "failure_reason": error_msg
            })
    elif status_result.get("user_exists", True):
        # Successful check (even if user not found, session worked)
        session_health["status"] = "active"
        session_health["last_success"] = checked_at
        session_health["failure_reason"] = None
    
    if status_result.get("error"):
        logger.error(f"Failed to check status for {target_username}: {status_result['error']}")
        history_entry = {
            "id": str(uuid.uuid4()),
            "target_username": target_username,
            "online_status": status_result.get("online_status", "Error"),
            "is_currently_online": False,
            "checked_at": checked_at,
            "status_changed": previous_status != status_result.get("online_status", "Error"),
            "user_exists": False,
            "error_message": status_result['error']
        }
        await db.status_history.insert_one(history_entry)
        
        await broadcast_status({
            "type": "status_update",
            "online_status": status_result.get("online_status", "Error"),
            "is_currently_online": False,
            "last_checked": checked_at,
            "status_changed": history_entry["status_changed"],
            "target_username": target_username,
            "user_exists": False,
            "error": status_result['error']
        })
        return
    
    if not status_result["user_exists"]:
        logger.info(f"User {target_username} not found, recording to history")
        history_entry = {
            "id": str(uuid.uuid4()),
            "target_username": target_username,
            "online_status": "User not found",
            "is_currently_online": False,
            "checked_at": checked_at,
            "status_changed": previous_status != "User not found",
            "user_exists": False
        }
        await db.status_history.insert_one(history_entry)
        
        await broadcast_status({
            "type": "status_update",
            "online_status": "User not found",
            "is_currently_online": False,
            "last_checked": checked_at,
            "status_changed": history_entry["status_changed"],
            "target_username": target_username,
            "user_exists": False
        })
        return
    
    # Determine if status changed
    status_changed = previous_status != status_result["online_status"]
    became_online = not previous_is_online and status_result["is_currently_online"]
    
    # Save to history
    history_entry = {
        "id": str(uuid.uuid4()),
        "target_username": target_username,
        "online_status": status_result["online_status"],
        "is_currently_online": status_result["is_currently_online"],
        "checked_at": checked_at,
        "status_changed": status_changed,
        "user_exists": True
    }
    await db.status_history.insert_one(history_entry)
    
    # Update global status for the most recent check
    last_checked = checked_at
    current_status_text = status_result["online_status"]
    
    # Broadcast to websockets
    await broadcast_status({
        "type": "status_update",
        "online_status": status_result["online_status"],
        "is_currently_online": status_result["is_currently_online"],
        "last_checked": checked_at,
        "status_changed": status_changed,
        "target_username": target_username,
        "user_exists": True
    })
    
    # Send notification if user came online NOW
    if became_online and notification_email:
        await send_email_notification(
            status_result["online_status"],
            target_username,
            notification_email,
            True
        )
        await broadcast_status({
            "type": "notification",
            "message": f"{target_username} is now ONLINE!",
            "is_currently_online": True
        })
    
    logger.info(f"Status check complete: {target_username} - {status_result['online_status']}")

async def perform_status_check():
    """Perform status check for all target usernames"""
    global current_status_text, last_checked
    
    try:
        settings_doc = await db.settings.find_one({}, {"_id": 0})
        if not settings_doc:
            logger.warning("No settings configured, skipping check")
            return
        
        session_cookie = settings_doc.get('session_cookie')
        email = settings_doc.get('thaifriendly_email', '')
        password_encrypted = settings_doc.get('thaifriendly_password_encrypted', '')
        
        if not session_cookie and (not email or not password_encrypted):
            logger.warning("No credentials or session cookie configured, skipping check")
            return
        
        password = decrypt_password(password_encrypted) if password_encrypted else ''
        notification_email = settings_doc.get('notification_email', '')
        
        # Get list of target usernames (support both old single and new multiple)
        target_usernames = settings_doc.get('target_usernames', [])
        if not target_usernames:
            # Fallback to single username for backward compatibility
            single_username = settings_doc.get('target_username', 'MayimeTH')
            if single_username:
                target_usernames = [single_username]
        
        if not target_usernames:
            logger.warning("No target usernames configured, skipping check")
            return
        
        logger.info(f"Checking {len(target_usernames)} user(s): {target_usernames}")
        
        # Check each user
        for username in target_usernames:
            await check_single_user(session_cookie, username, notification_email, email, password)
            # Small delay between checks to avoid rate limiting
            if len(target_usernames) > 1:
                await asyncio.sleep(2)
        
    except Exception as e:
        logger.error(f"Error in status check: {e}")

# API Routes
@api_router.get("/")
async def root():
    return {"message": "NetSentinel API v1.0"}

@api_router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    settings_doc = await db.settings.find_one({}, {"_id": 0})
    if not settings_doc:
        default_settings = Settings()
        doc = default_settings.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.settings.insert_one(doc)
        settings_doc = doc
    
    # Get target usernames, falling back to single username for backward compat
    target_usernames = settings_doc.get('target_usernames', [])
    if not target_usernames:
        single = settings_doc.get('target_username', 'MayimeTH')
        if single:
            target_usernames = [single]
    
    return SettingsResponse(
        id=settings_doc.get('id', ''),
        thaifriendly_email=settings_doc.get('thaifriendly_email', ''),
        has_password=bool(settings_doc.get('thaifriendly_password_encrypted')),
        target_username=target_usernames[0] if target_usernames else 'MayimeTH',
        target_usernames=target_usernames,
        notification_email=settings_doc.get('notification_email', ''),
        check_interval_minutes=settings_doc.get('check_interval_minutes', 10),
        has_session_cookie=bool(settings_doc.get('session_cookie'))
    )

@api_router.put("/settings")
async def update_settings(settings: SettingsUpdate):
    update_data = {}
    
    if settings.thaifriendly_email is not None:
        update_data['thaifriendly_email'] = settings.thaifriendly_email
    
    if settings.thaifriendly_password is not None and settings.thaifriendly_password:
        update_data['thaifriendly_password_encrypted'] = encrypt_password(settings.thaifriendly_password)
    
    if settings.target_username is not None:
        update_data['target_username'] = settings.target_username
    
    if settings.target_usernames is not None:
        update_data['target_usernames'] = settings.target_usernames
        # Also update single username for backward compat
        if settings.target_usernames:
            update_data['target_username'] = settings.target_usernames[0]
    
    if settings.notification_email is not None:
        update_data['notification_email'] = settings.notification_email
    
    if settings.check_interval_minutes is not None:
        update_data['check_interval_minutes'] = settings.check_interval_minutes
    
    if settings.session_cookie is not None:
        update_data['session_cookie'] = settings.session_cookie
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    existing = await db.settings.find_one({})
    if not existing:
        default_settings = Settings()
        doc = default_settings.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        doc.update(update_data)
        await db.settings.insert_one(doc)
    else:
        await db.settings.update_one({}, {"$set": update_data})
    
    return {"status": "success", "message": "Settings updated"}

@api_router.get("/history", response_model=List[StatusHistoryResponse])
async def get_history(limit: int = 100):
    history = await db.status_history.find(
        {},
        {"_id": 0}
    ).sort("checked_at", -1).limit(limit).to_list(limit)
    
    result = []
    for h in history:
        online_status = h.get('online_status')
        if online_status is None or isinstance(online_status, bool):
            is_online = h.get('is_online', h.get('is_currently_online', False))
            online_status = "Online now" if is_online else "Offline"
        
        result.append(StatusHistoryResponse(
            id=h.get('id', ''),
            target_username=h.get('target_username', 'MayimeTH'),
            online_status=str(online_status),
            is_currently_online=h.get('is_currently_online', h.get('is_online', False)),
            checked_at=h.get('checked_at', ''),
            status_changed=h.get('status_changed', False),
            user_exists=h.get('user_exists', True)
        ))
    
    return result

@api_router.get("/monitoring/status", response_model=MonitoringStatus)
async def get_monitoring_status():
    settings_doc = await db.settings.find_one({}, {"_id": 0})
    target_username = settings_doc.get('target_username', 'MayimeTH') if settings_doc else 'MayimeTH'
    
    return MonitoringStatus(
        is_monitoring=monitoring_active,
        current_status=current_status_text,
        is_currently_online=current_status_text == "Online now" if current_status_text else False,
        last_checked=last_checked,
        target_username=target_username
    )

@api_router.get("/session/health", response_model=SessionHealth)
async def get_session_health():
    """Get current session health status"""
    return SessionHealth(
        status=session_health["status"],
        last_success=session_health["last_success"],
        last_failure=session_health["last_failure"],
        failure_reason=session_health["failure_reason"]
    )

@api_router.post("/monitoring/start")
async def start_monitoring():
    global monitoring_active
    
    settings_doc = await db.settings.find_one({}, {"_id": 0})
    session_cookie = settings_doc.get('session_cookie') if settings_doc else None
    has_creds = settings_doc and settings_doc.get('thaifriendly_email') and settings_doc.get('thaifriendly_password_encrypted')
    
    if not session_cookie and not has_creds:
        raise HTTPException(status_code=400, detail="Please configure session cookie or ThaiFriendly credentials first")
    
    interval = settings_doc.get('check_interval_minutes', 10)
    
    if monitoring_active:
        return {"status": "already_running", "message": "Monitoring is already active"}
    
    if scheduler.get_job('status_check'):
        scheduler.remove_job('status_check')
    
    scheduler.add_job(
        perform_status_check,
        'interval',
        minutes=interval,
        id='status_check',
        replace_existing=True
    )
    
    if not scheduler.running:
        scheduler.start()
    
    monitoring_active = True
    
    # Perform initial check
    await perform_status_check()
    
    return {"status": "started", "message": f"Monitoring started (every {interval} minutes)"}

@api_router.post("/monitoring/stop")
async def stop_monitoring():
    global monitoring_active
    
    if scheduler.get_job('status_check'):
        scheduler.remove_job('status_check')
    
    monitoring_active = False
    
    return {"status": "stopped", "message": "Monitoring stopped"}

@api_router.post("/monitoring/check-now")
async def check_now():
    await perform_status_check()
    return {
        "status": "checked",
        "online_status": current_status_text,
        "last_checked": last_checked
    }

@api_router.delete("/history")
async def clear_history():
    await db.status_history.delete_many({})
    return {"status": "success", "message": "History cleared"}

# WebSocket for real-time updates
@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.append(websocket)
    
    try:
        await websocket.send_json({
            "type": "connection",
            "is_monitoring": monitoring_active,
            "current_status": current_status_text,
            "last_checked": last_checked
        })
        
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in connected_websockets:
            connected_websockets.remove(websocket)

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    if not scheduler.running:
        scheduler.start()
    logger.info("NetSentinel API started")

@app.on_event("shutdown")
async def shutdown_db_client():
    if scheduler.running:
        scheduler.shutdown()
    client.close()
