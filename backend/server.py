from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import asyncio
import httpx
from bs4 import BeautifulSoup
import resend
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from cryptography.fernet import Fernet
import base64
import hashlib
import json

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

# Encryption key for credentials (generate a fixed key based on a secret)
SECRET_KEY = os.environ.get('SECRET_KEY', 'netsentinel-secret-key-2024')
key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
cipher = Fernet(key)

# Global state
scheduler = AsyncIOScheduler()
monitoring_active = False
current_status = None
last_checked = None
connected_websockets: List[WebSocket] = []

# Models
class Settings(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    thaifriendly_email: str = ""
    thaifriendly_password_encrypted: str = ""
    target_username: str = "MayimeTH"
    notification_email: str = ""
    check_interval_minutes: int = 10
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SettingsUpdate(BaseModel):
    thaifriendly_email: Optional[str] = None
    thaifriendly_password: Optional[str] = None
    target_username: Optional[str] = None
    notification_email: Optional[str] = None
    check_interval_minutes: Optional[int] = None

class SettingsResponse(BaseModel):
    id: str
    thaifriendly_email: str
    has_password: bool
    target_username: str
    notification_email: str
    check_interval_minutes: int

class StatusHistory(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_username: str
    is_online: bool
    checked_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status_changed: bool = False

class StatusHistoryResponse(BaseModel):
    id: str
    target_username: str
    is_online: bool
    checked_at: str
    status_changed: bool

class MonitoringStatus(BaseModel):
    is_monitoring: bool
    current_status: Optional[bool] = None
    last_checked: Optional[str] = None
    target_username: str = "MayimeTH"

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

async def send_email_notification(is_online: bool, username: str, notification_email: str):
    """Send email notification when user comes online"""
    if not resend_api_key or not notification_email:
        logger.warning("Email notification skipped: No API key or notification email configured")
        return
    
    status_text = "ONLINE" if is_online else "OFFLINE"
    status_color = "#00FF9C" if is_online else "#FF2E2E"
    
    html_content = f"""
    <div style="font-family: 'Courier New', monospace; background-color: #050505; color: #EDEDED; padding: 40px; text-align: center;">
        <h1 style="color: {status_color}; font-size: 48px; margin: 0;">[ {status_text} ]</h1>
        <p style="font-size: 24px; margin-top: 20px;">User <strong>{username}</strong> is now {status_text.lower()}</p>
        <p style="color: #888888; font-size: 14px; margin-top: 30px;">NetSentinel Monitor • {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}</p>
    </div>
    """
    
    try:
        params = {
            "from": os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev'),
            "to": [notification_email],
            "subject": f"🔔 {username} is now {status_text} on ThaiFriendly",
            "html": html_content
        }
        email = await asyncio.to_thread(resend.Emails.send, params)
        logger.info(f"Email notification sent: {email}")
    except Exception as e:
        logger.error(f"Failed to send email: {e}")

async def check_thaifriendly_status(email: str, password: str, target_username: str) -> Optional[bool]:
    """
    Check if target user is online on ThaiFriendly.
    Returns True if online, False if offline, None if error.
    """
    global current_status, last_checked
    
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            # Step 1: Get login page to get any necessary cookies/tokens
            await client.get("https://www.thaifriendly.com/login")
            
            # Step 2: Login
            login_data = {
                "email": email,
                "password": password,
                "remember": "1"
            }
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Referer": "https://www.thaifriendly.com/login"
            }
            
            login_response = await client.post(
                "https://www.thaifriendly.com/login",
                data=login_data,
                headers=headers
            )
            
            logger.info(f"Login response status: {login_response.status_code}")
            
            # Step 3: Search for the user
            search_url = f"https://www.thaifriendly.com/search?username={target_username}"
            await client.get(search_url, headers=headers)
            
            # Step 4: Try to access user profile
            profile_url = f"https://www.thaifriendly.com/{target_username}"
            profile_response = await client.get(profile_url, headers=headers)
            
            logger.info(f"Profile response status: {profile_response.status_code}")
            
            # Parse the response to check online status
            soup = BeautifulSoup(profile_response.text, 'html.parser')
            
            # Look for online indicators (common patterns)
            # ThaiFriendly typically shows "Online" text or a green dot
            page_text = soup.get_text().lower()
            
            is_online = False
            
            # Check for various online indicators
            online_indicators = [
                'online now',
                'currently online',
                'is online',
                'class="online"',
                'status-online',
                'user-online'
            ]
            
            for indicator in online_indicators:
                if indicator in page_text or indicator in str(soup).lower():
                    is_online = True
                    break
            
            # Also check for specific HTML elements
            online_elements = soup.find_all(class_=lambda x: x and 'online' in x.lower() if x else False)
            if online_elements:
                is_online = True
            
            # Check for green status dot images or spans
            _ = soup.find_all(['span', 'div', 'img'], attrs={'class': lambda x: x and any(indicator in str(x).lower() for indicator in ['status', 'online', 'active']) if x else False})
            
            last_checked = datetime.now(timezone.utc).isoformat()
            current_status = is_online
            
            return is_online
            
    except Exception as e:
        logger.error(f"Error checking ThaiFriendly status: {e}")
        return None

async def perform_status_check():
    """Perform a status check and handle notifications"""
    global current_status, last_checked
    
    try:
        # Get settings
        settings_doc = await db.settings.find_one({}, {"_id": 0})
        if not settings_doc or not settings_doc.get('thaifriendly_email') or not settings_doc.get('thaifriendly_password_encrypted'):
            logger.warning("No credentials configured, skipping check")
            return
        
        email = settings_doc['thaifriendly_email']
        password = decrypt_password(settings_doc['thaifriendly_password_encrypted'])
        target_username = settings_doc.get('target_username', 'MayimeTH')
        notification_email = settings_doc.get('notification_email', '')
        
        # Get previous status
        last_history = await db.status_history.find_one(
            {"target_username": target_username},
            {"_id": 0},
            sort=[("checked_at", -1)]
        )
        previous_status = last_history.get('is_online') if last_history else None
        
        # Check current status
        is_online = await check_thaifriendly_status(email, password, target_username)
        
        if is_online is None:
            logger.error("Failed to check status")
            return
        
        # Determine if status changed
        status_changed = previous_status is not None and previous_status != is_online
        
        # Save to history
        history_entry = {
            "id": str(uuid.uuid4()),
            "target_username": target_username,
            "is_online": is_online,
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "status_changed": status_changed
        }
        await db.status_history.insert_one(history_entry)
        
        # Broadcast to websockets
        await broadcast_status({
            "type": "status_update",
            "is_online": is_online,
            "last_checked": last_checked,
            "status_changed": status_changed,
            "target_username": target_username
        })
        
        # Send notification if user came online
        if status_changed and is_online:
            await send_email_notification(is_online, target_username, notification_email)
            # Also broadcast notification event
            await broadcast_status({
                "type": "notification",
                "message": f"{target_username} is now ONLINE!",
                "is_online": True
            })
        
        logger.info(f"Status check complete: {target_username} is {'ONLINE' if is_online else 'OFFLINE'}")
        
    except Exception as e:
        logger.error(f"Error in status check: {e}")

# API Routes
@api_router.get("/")
async def root():
    return {"message": "NetSentinel API v1.0"}

@api_router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    """Get current settings (password excluded)"""
    settings_doc = await db.settings.find_one({}, {"_id": 0})
    if not settings_doc:
        # Create default settings
        default_settings = Settings()
        doc = default_settings.model_dump()
        doc['created_at'] = doc['created_at'].isoformat()
        doc['updated_at'] = doc['updated_at'].isoformat()
        await db.settings.insert_one(doc)
        settings_doc = doc
    
    return SettingsResponse(
        id=settings_doc.get('id', ''),
        thaifriendly_email=settings_doc.get('thaifriendly_email', ''),
        has_password=bool(settings_doc.get('thaifriendly_password_encrypted')),
        target_username=settings_doc.get('target_username', 'MayimeTH'),
        notification_email=settings_doc.get('notification_email', ''),
        check_interval_minutes=settings_doc.get('check_interval_minutes', 10)
    )

@api_router.put("/settings")
async def update_settings(settings: SettingsUpdate):
    """Update settings"""
    update_data = {}
    
    if settings.thaifriendly_email is not None:
        update_data['thaifriendly_email'] = settings.thaifriendly_email
    
    if settings.thaifriendly_password is not None and settings.thaifriendly_password:
        update_data['thaifriendly_password_encrypted'] = encrypt_password(settings.thaifriendly_password)
    
    if settings.target_username is not None:
        update_data['target_username'] = settings.target_username
    
    if settings.notification_email is not None:
        update_data['notification_email'] = settings.notification_email
    
    if settings.check_interval_minutes is not None:
        update_data['check_interval_minutes'] = settings.check_interval_minutes
    
    update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
    
    # Ensure settings document exists
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
    """Get status history"""
    history = await db.status_history.find(
        {},
        {"_id": 0}
    ).sort("checked_at", -1).limit(limit).to_list(limit)
    
    return [StatusHistoryResponse(
        id=h.get('id', ''),
        target_username=h.get('target_username', 'MayimeTH'),
        is_online=h.get('is_online', False),
        checked_at=h.get('checked_at', ''),
        status_changed=h.get('status_changed', False)
    ) for h in history]

@api_router.get("/monitoring/status", response_model=MonitoringStatus)
async def get_monitoring_status():
    """Get current monitoring status"""
    settings_doc = await db.settings.find_one({}, {"_id": 0})
    target_username = settings_doc.get('target_username', 'MayimeTH') if settings_doc else 'MayimeTH'
    
    return MonitoringStatus(
        is_monitoring=monitoring_active,
        current_status=current_status,
        last_checked=last_checked,
        target_username=target_username
    )

@api_router.post("/monitoring/start")
async def start_monitoring():
    """Start the monitoring scheduler"""
    global monitoring_active
    
    # Get settings
    settings_doc = await db.settings.find_one({}, {"_id": 0})
    if not settings_doc or not settings_doc.get('thaifriendly_email') or not settings_doc.get('thaifriendly_password_encrypted'):
        raise HTTPException(status_code=400, detail="Please configure ThaiFriendly credentials first")
    
    interval = settings_doc.get('check_interval_minutes', 10)
    
    if monitoring_active:
        return {"status": "already_running", "message": "Monitoring is already active"}
    
    # Remove existing job if any
    if scheduler.get_job('status_check'):
        scheduler.remove_job('status_check')
    
    # Add new job
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
    """Stop the monitoring scheduler"""
    global monitoring_active
    
    if scheduler.get_job('status_check'):
        scheduler.remove_job('status_check')
    
    monitoring_active = False
    
    return {"status": "stopped", "message": "Monitoring stopped"}

@api_router.post("/monitoring/check-now")
async def check_now():
    """Perform an immediate status check"""
    await perform_status_check()
    return {
        "status": "checked",
        "is_online": current_status,
        "last_checked": last_checked
    }

@api_router.delete("/history")
async def clear_history():
    """Clear all status history"""
    await db.status_history.delete_many({})
    return {"status": "success", "message": "History cleared"}

# WebSocket for real-time updates
@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.append(websocket)
    
    try:
        # Send current status on connect
        await websocket.send_json({
            "type": "connection",
            "is_monitoring": monitoring_active,
            "current_status": current_status,
            "last_checked": last_checked
        })
        
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in connected_websockets:
            connected_websockets.remove(websocket)

# Include the router in the main app
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
    """Initialize scheduler on startup"""
    if not scheduler.running:
        scheduler.start()
    logger.info("NetSentinel API started")

@app.on_event("shutdown")
async def shutdown_db_client():
    if scheduler.running:
        scheduler.shutdown()
    client.close()
