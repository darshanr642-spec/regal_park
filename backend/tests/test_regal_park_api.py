"""Regal Park Villas - Backend API tests (pytest)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://regal-project-hub.preview.emergentagent.com").rstrip("/")
PROJECT_ID = "villa-aurelia-12"

ADMIN_EMAIL = "admin@regalpark.com"
ADMIN_PW = "Admin@123"
CLIENT_EMAIL = "client@regalpark.com"
CLIENT_PW = "Client@123"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# ---------------- Auth ----------------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PW}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body and body["token_type"] == "bearer"

    def test_login_invalid(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_me_with_token(self, h):
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=h, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == ADMIN_EMAIL
        assert body["role"] == "ADMIN"

    def test_me_without_token(self):
        r = requests.get(f"{BASE_URL}/api/auth/me", timeout=30)
        assert r.status_code == 401

    def test_client_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CLIENT_EMAIL, "password": CLIENT_PW}, timeout=30)
        assert r.status_code == 200


# ---------------- Projects ----------------
class TestProjects:
    def test_list_projects(self, h):
        r = requests.get(f"{BASE_URL}/api/projects", headers=h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["id"] == PROJECT_ID
        assert data[0]["name"] == "Villa Aurelia"
        assert data[0]["budget_inr"] == 40000000.0

    def test_get_project_detail(self, h):
        r = requests.get(f"{BASE_URL}/api/projects/{PROJECT_ID}", headers=h, timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body["progress_pct"] == 46.0
        assert body["built_up_area_sqft"] == 7850

    def test_get_project_not_found(self, h):
        r = requests.get(f"{BASE_URL}/api/projects/nonexistent", headers=h, timeout=30)
        assert r.status_code == 404

    def test_unauth_projects(self):
        r = requests.get(f"{BASE_URL}/api/projects", timeout=30)
        assert r.status_code == 401


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_summary(self, h):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary", headers=h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ["total_projects", "under_construction", "avg_progress_pct", "total_budget_inr",
                  "actual_spent_inr", "pending_approvals", "delayed_tasks", "pending_bills",
                  "open_snags", "recent_activity"]:
            assert k in d, f"Missing {k}"
        assert d["total_projects"] == 1
        assert d["under_construction"] == 1
        assert d["total_budget_inr"] == 40000000.0
        assert isinstance(d["recent_activity"], list)
        assert len(d["recent_activity"]) == 6


# ---------------- Domain Lists ----------------
class TestDomainLists:
    @pytest.mark.parametrize("endpoint,expected_count", [
        ("/api/stages", 23),
        ("/api/boq", 20),
        ("/api/materials", 12),
        ("/api/billing", 6),
        ("/api/quality", 9),
        ("/api/snags", 8),
        ("/api/team", 12),
        ("/api/approvals", 8),
        ("/api/site-reports", 5),
    ])
    def test_list_counts(self, h, endpoint, expected_count):
        r = requests.get(f"{BASE_URL}{endpoint}", headers=h, timeout=30)
        assert r.status_code == 200, f"{endpoint} -> {r.status_code} {r.text[:200]}"
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == expected_count, f"{endpoint} expected {expected_count} got {len(data)}"

    def test_stages_sorted_by_order(self, h):
        r = requests.get(f"{BASE_URL}/api/stages", headers=h, timeout=30)
        data = r.json()
        orders = [s["order"] for s in data]
        assert orders == sorted(orders)
        assert orders[0] == 1 and orders[-1] == 23

    def test_unauth_stages(self):
        r = requests.get(f"{BASE_URL}/api/stages", timeout=30)
        assert r.status_code == 401


# ---------------- Writes ----------------
class TestWrites:
    def test_create_site_report(self, h):
        payload = {
            "project_id": PROJECT_ID,
            "date": "2026-05-15",
            "labour_count": 55,
            "work_completed": "TEST_ Marble laying foyer + plastering complete",
            "materials_received": "TEST_ Marble batch-3 received",
            "machinery_used": "Marble cutter",
            "issues": None,
            "tomorrow_plan": "Continue marble laying living room",
            "weather": "Sunny, 33C",
            "safety_observations": "All clear",
        }
        r = requests.post(f"{BASE_URL}/api/site-reports", headers=h, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        new_id = r.json()["id"]
        # verify GET
        r2 = requests.get(f"{BASE_URL}/api/site-reports", headers=h, timeout=30)
        ids = [x["id"] for x in r2.json()]
        assert new_id in ids

    def test_update_quality(self, h):
        r = requests.get(f"{BASE_URL}/api/quality", headers=h, timeout=30)
        qc = r.json()[0]
        original_result = qc["result"]
        new_result = "FAIL" if original_result != "FAIL" else "PASS"
        r2 = requests.patch(f"{BASE_URL}/api/quality/{qc['id']}", headers=h, json={"result": new_result}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["result"] == new_result
        # revert
        requests.patch(f"{BASE_URL}/api/quality/{qc['id']}", headers=h, json={"result": original_result}, timeout=30)

    def test_update_snag(self, h):
        r = requests.get(f"{BASE_URL}/api/snags", headers=h, timeout=30)
        snag = r.json()[0]
        original = snag["status"]
        new_status = "IN_PROGRESS" if original != "IN_PROGRESS" else "OPEN"
        r2 = requests.patch(f"{BASE_URL}/api/snags/{snag['id']}", headers=h, json={"status": new_status}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["status"] == new_status
        requests.patch(f"{BASE_URL}/api/snags/{snag['id']}", headers=h, json={"status": original}, timeout=30)

    def test_create_report_unauth(self):
        r = requests.post(f"{BASE_URL}/api/site-reports", json={"project_id": PROJECT_ID}, timeout=30)
        assert r.status_code in (401, 422)


# ---------------- Other endpoint protections ----------------
class TestUnauth:
    @pytest.mark.parametrize("endpoint", [
        "/api/dashboard/summary", "/api/boq", "/api/materials", "/api/billing",
        "/api/quality", "/api/snags", "/api/team", "/api/approvals", "/api/site-reports",
    ])
    def test_unauthenticated_returns_401(self, endpoint):
        r = requests.get(f"{BASE_URL}{endpoint}", timeout=30)
        assert r.status_code == 401, f"{endpoint} expected 401 got {r.status_code}"
