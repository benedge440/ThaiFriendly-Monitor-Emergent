# ThaiFriendly User Monitor - Product Requirements Document

## Original Problem Statement
User wants an app that connects to Thaifriendly and notifies them when a specific username (initially "MayimeTH") is online.

## Core Requirements
1. Connect to Thaifriendly to check a user's online status
2. Support monitoring multiple usernames
3. User provides their credentials and session cookie via app settings
4. Implement browser and email notifications (using Resend)
5. Configurable monitoring frequency (default: 10 minutes)
6. Maintain history log of status changes
7. Activity log features:
   - Filter by status (Online, Offline, Unknown, Not Found)
   - Username associated with each entry
   - Search bar to filter by username
   - Record entries even if user not found
8. Display individual status for each monitored user
9. Session health indicator (active/expired)
10. Activity log scrollable on mobile devices
11. **Profile screenshot capture** when user comes online (stored in MongoDB)

## Technical Architecture

### Backend (FastAPI)
- **Location:** `/app/backend/server.py`
- **Port:** 8001
- **Database:** MongoDB
- **Key Dependencies:** Playwright (web scraping), APScheduler (background tasks), Resend (email - not fully implemented)

### Frontend (React)
- **Location:** `/app/frontend/`
- **Port:** 3000
- **Key Components:** All in App.js (HistoryLog, SettingsPanel, StatusHero, SessionHealthIndicator)

### Authentication
- Uses user-provided `PHPSESSID` session cookie (not direct login automation)
- Session health indicator shows if cookie is ACTIVE or EXPIRED

## Database Schema

### `settings` collection
- `thaifriendly_email`: string
- `thaifriendly_password_encrypted`: string
- `session_cookie`: string (PHPSESSID)
- `target_usernames`: array of strings
- `notification_email`: string
- `check_interval_minutes`: number

### `status_history` collection
- `id`: string (UUID)
- `target_username`: string
- `online_status`: string
- `is_currently_online`: boolean
- `checked_at`: datetime (ISO string)
- `status_changed`: boolean
- `user_exists`: boolean
- `profile_screenshot`: string (base64, optional - only when status changes to online)

## API Endpoints
- `POST /api/settings` - Update settings
- `GET /api/settings` - Get current settings
- `POST /api/monitoring/start` - Start monitoring
- `POST /api/monitoring/stop` - Stop monitoring
- `GET /api/monitoring/status` - Get monitoring status
- `GET /api/history` - Get activity log (unlimited by default, optional `limit` param)
- `DELETE /api/history` - Clear history
- `GET /api/session-health` - Get session cookie status
- WebSocket `/ws` - Real-time updates

## Implemented Features (as of March 2026)
- [x] Multi-user monitoring with Playwright web scraping
- [x] Session cookie authentication
- [x] Per-user status cards
- [x] Activity log with search/filter
- [x] Session health indicator
- [x] Mobile scrolling for activity log
- [x] Unlimited activity log entries
- [x] Profile screenshot capture on status change to Online
- [x] Screenshot viewing modal in activity log

## Pending Features
- [ ] Resend email notifications (needs API key from user)

## Future Enhancements
- Auto-delete old screenshots after configurable period
- Option to capture screenshots on every check vs only on status change
- Browser push notifications
