# NetSentinel - ThaiFriendly User Monitor

## Original Problem Statement
Build an app that connects to Thaifriendly and lets user know when username "MayimeTH" is online.

## User Choices
- Browser + Email notifications (via Resend)
- 10 minute monitoring interval
- History log of online status
- Dashboard showing current status
- Settings page to input ThaiFriendly credentials privately
- Notification email: ben3162@hotmail.com

## Architecture
- **Backend**: FastAPI with MongoDB, APScheduler for periodic checks, httpx/BeautifulSoup for web scraping
- **Frontend**: React with cyberpunk/terminal theme, Framer Motion animations, WebSocket for real-time updates
- **Database**: MongoDB for settings and status history
- **Email**: Resend API (pending user's API key)

## Core Features Implemented ✅
1. Settings vault for secure credential storage (encrypted)
2. Real-time status monitoring dashboard
3. Start/Stop monitoring controls
4. Manual refresh/check-now functionality
5. Activity log with status history
6. WebSocket for real-time updates
7. Browser push notifications
8. Email notifications (Resend integration ready, pending API key)
9. Responsive design (mobile tabs, desktop grid)

## User Personas
- Individual user monitoring a specific ThaiFriendly profile

## What's Been Implemented (Jan 2026)
- [x] Backend API with all CRUD endpoints
- [x] Web scraping module for ThaiFriendly
- [x] Encrypted credential storage
- [x] Background scheduler (APScheduler)
- [x] WebSocket real-time updates
- [x] Resend email integration (structure ready)
- [x] Frontend dashboard with cyberpunk theme
- [x] Settings form with password visibility toggle
- [x] Activity log with animations
- [x] Browser notification support
- [x] Mobile responsive design

## Prioritized Backlog
### P0 (Critical)
- [ ] User to provide Resend API key for email notifications

### P1 (Important)
- [ ] Enhanced online detection patterns for ThaiFriendly
- [ ] Login session persistence/cookie caching

### P2 (Nice to Have)
- [ ] Multiple user monitoring
- [ ] Custom notification sounds
- [ ] Statistics/analytics dashboard

## Next Tasks
1. User needs to add Resend API key to enable email notifications
2. Test with actual ThaiFriendly credentials
