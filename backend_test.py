#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class NetSentinelAPITester:
    def __init__(self, base_url="https://thaifriendly-tracker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, success, status_code, response_data=None, error=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            'test_name': test_name,
            'success': success,
            'status_code': status_code,
            'response_data': response_data,
            'error': str(error) if error else None,
            'timestamp': datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name} - Status: {status_code}")
        if error:
            print(f"    Error: {error}")
        if response_data and isinstance(response_data, dict):
            print(f"    Response: {json.dumps(response_data, indent=2)[:200]}...")

    def test_api_root(self):
        """Test GET /api/ - should return NetSentinel API message"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=30)
            success = response.status_code == 200 and 'NetSentinel' in response.text
            self.log_result("API Root", success, response.status_code, response.json())
            return success
        except Exception as e:
            self.log_result("API Root", False, 0, error=e)
            return False

    def test_get_settings(self):
        """Test GET /api/settings - should return settings"""
        try:
            response = requests.get(f"{self.api_url}/settings", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_result("Get Settings", success, response.status_code, data)
            return success, data
        except Exception as e:
            self.log_result("Get Settings", False, 0, error=e)
            return False, None

    def test_update_settings(self):
        """Test PUT /api/settings - should save ThaiFriendly credentials"""
        test_data = {
            "thaifriendly_email": "test@example.com",
            "thaifriendly_password": "testpass123",
            "target_username": "MayimeTH",
            "notification_email": "ben3162@hotmail.com",
            "check_interval_minutes": 10
        }
        
        try:
            response = requests.put(
                f"{self.api_url}/settings",
                json=test_data,
                headers={'Content-Type': 'application/json'},
                timeout=30
            )
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_result("Update Settings", success, response.status_code, data)
            return success
        except Exception as e:
            self.log_result("Update Settings", False, 0, error=e)
            return False

    def test_get_history(self):
        """Test GET /api/history - should return status history"""
        try:
            response = requests.get(f"{self.api_url}/history", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_result("Get History", success, response.status_code, data)
            return success, data
        except Exception as e:
            self.log_result("Get History", False, 0, error=e)
            return False, None

    def test_monitoring_status(self):
        """Test GET /api/monitoring/status - should return current monitoring status"""
        try:
            response = requests.get(f"{self.api_url}/monitoring/status", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_result("Monitoring Status", success, response.status_code, data)
            return success, data
        except Exception as e:
            self.log_result("Monitoring Status", False, 0, error=e)
            return False, None

    def test_start_monitoring(self):
        """Test POST /api/monitoring/start - should start monitoring"""
        try:
            response = requests.post(f"{self.api_url}/monitoring/start", timeout=30)
            success = response.status_code in [200, 400]  # 400 if no credentials is acceptable
            data = response.json() if response.status_code in [200, 400] else None
            self.log_result("Start Monitoring", success, response.status_code, data)
            return success
        except Exception as e:
            self.log_result("Start Monitoring", False, 0, error=e)
            return False

    def test_stop_monitoring(self):
        """Test POST /api/monitoring/stop - should stop monitoring"""
        try:
            response = requests.post(f"{self.api_url}/monitoring/stop", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_result("Stop Monitoring", success, response.status_code, data)
            return success
        except Exception as e:
            self.log_result("Stop Monitoring", False, 0, error=e)
            return False

    def test_check_now(self):
        """Test POST /api/monitoring/check-now - should perform immediate check"""
        try:
            response = requests.post(f"{self.api_url}/monitoring/check-now", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_result("Check Now", success, response.status_code, data)
            return success
        except Exception as e:
            self.log_result("Check Now", False, 0, error=e)
            return False

    def test_clear_history(self):
        """Test DELETE /api/history - should clear all history"""
        try:
            response = requests.delete(f"{self.api_url}/history", timeout=30)
            success = response.status_code == 200
            data = response.json() if success else None
            self.log_result("Clear History", success, response.status_code, data)
            return success
        except Exception as e:
            self.log_result("Clear History", False, 0, error=e)
            return False

    def run_all_tests(self):
        """Run comprehensive API test suite"""
        print(f"\n🔍 Testing NetSentinel API at {self.base_url}")
        print("=" * 60)
        
        # Test API root
        self.test_api_root()
        
        # Test settings endpoints
        settings_success, initial_settings = self.test_get_settings()
        
        # Test settings update
        self.test_update_settings()
        
        # Verify settings were updated
        if settings_success:
            updated_success, updated_settings = self.test_get_settings()
            if updated_success and updated_settings:
                print(f"    Settings updated: Email = {updated_settings.get('thaifriendly_email', 'N/A')}")
        
        # Test history endpoints
        history_success, history_data = self.test_get_history()
        
        # Test monitoring endpoints
        status_success, status_data = self.test_monitoring_status()
        
        # Test monitoring controls
        self.test_start_monitoring()
        self.test_stop_monitoring()
        
        # Test check now
        self.test_check_now()
        
        # Test clear history
        self.test_clear_history()
        
        # Final results
        print("\n" + "=" * 60)
        print(f"📊 RESULTS: {self.tests_passed}/{self.tests_run} tests passed")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Identify failed tests
        failed_tests = [r for r in self.test_results if not r['success']]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                error_msg = test['error'] or f"Status {test['status_code']}"
                print(f"  - {test['test_name']}: {error_msg}")
        else:
            print("\n🎉 All tests passed!")
        
        return self.tests_passed == self.tests_run

def main():
    tester = NetSentinelAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump({
            'summary': {
                'tests_run': tester.tests_run,
                'tests_passed': tester.tests_passed,
                'success_rate': tester.tests_passed / tester.tests_run * 100,
                'timestamp': datetime.now().isoformat()
            },
            'results': tester.test_results
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())