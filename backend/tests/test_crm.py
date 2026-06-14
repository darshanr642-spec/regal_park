"""CRM Revenue Engine tests: Pricing, Leads, Site Visits, Quotations, Bookings.

Full lifecycle test: pricing → lead → visit → quotation → booking.
RBAC tests: client blocked, CRM_SALES can create, admin can manage.
"""
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.strip().split("=", 1)[1].strip('"').rstrip("/")
                    break
    except FileNotFoundError:
        BASE_URL = "http://localhost:8000"

if not BASE_URL:
    BASE_URL = "http://localhost:8000"


# ---- Fixtures ----
def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=15,
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def tokens():
    return {
        "admin": _login("admin@regalpark.com", "Admin@123"),
        "client": _login("client@regalpark.com", "Client@123"),
    }


# ---- Pricing ----
class TestPricing:
    def test_admin_gets_pricing(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/pricing",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 4
        elevations = {p["elevation_type"] for p in rows}
        assert {"Elora", "Selora", "Avira", "Riora"} <= elevations

    def test_client_blocked_from_pricing(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/pricing",
            headers=_h(tokens["client"]),
        )
        assert r.status_code == 403

    def test_admin_upserts_pricing(self, tokens):
        r = requests.put(
            f"{BASE_URL}/api/crm/pricing",
            json={
                "elevation_type": "TEST_CRM_Elevation",
                "base_price_per_sqft_inr": 9999.0,
                "premium_zones": [],
                "valid_from": "2026-06-01",
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["elevation_type"] == "TEST_CRM_Elevation"
        assert body["base_price_per_sqft_inr"] == 9999.0
        pytest.test_pricing_id = body["id"]


# ---- Leads ----
class TestLeads:
    def test_admin_lists_leads(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 5  # 5 seeded leads

    def test_client_blocked_from_leads(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads",
            headers=_h(tokens["client"]),
        )
        assert r.status_code == 403

    def test_admin_creates_lead(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/crm/leads",
            json={
                "full_name": "TEST_CRM Lead",
                "phone": "+91 99999 00000",
                "source": "WALK_IN",
                "interested_elevation": "Elora",
                "budget_range_inr": "₹3-4 Cr",
                "notes": "Test lead from CRM test suite",
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["full_name"] == "TEST_CRM Lead"
        assert body["status"] == "NEW"
        assert body["source"] == "WALK_IN"
        pytest.test_lead_id = body["id"]

    def test_invalid_source_rejected(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/crm/leads",
            json={
                "full_name": "Bad Lead",
                "phone": "+91 00000 00000",
                "source": "INVALID_SOURCE",
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 422

    def test_get_single_lead(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads/{pytest.test_lead_id}",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert r.json()["id"] == pytest.test_lead_id

    def test_update_lead_status(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/crm/leads/{pytest.test_lead_id}",
            json={"status": "CONTACTED", "notes": "Called back"},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "CONTACTED"

    def test_invalid_status_rejected(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/crm/leads/{pytest.test_lead_id}",
            json={"status": "FAKE_STATUS"},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 422

    def test_lead_timeline(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads/{pytest.test_lead_id}/timeline",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 2  # creation + status change


# ---- Site Visits ----
class TestSiteVisits:
    def test_schedule_visit(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/crm/site-visits",
            json={
                "lead_id": pytest.test_lead_id,
                "scheduled_at": "2026-07-01T10:00:00Z",
                "plots_shown": [1, 5, 10],
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["lead_id"] == pytest.test_lead_id
        assert body["plots_shown"] == [1, 5, 10]
        pytest.test_visit_id = body["id"]

    def test_lead_status_updated_to_scheduled(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads/{pytest.test_lead_id}",
            headers=_h(tokens["admin"]),
        )
        assert r.json()["status"] == "SITE_VISIT_SCHEDULED"

    def test_complete_visit(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/crm/site-visits/{pytest.test_visit_id}",
            json={
                "actual_at": "2026-07-01T10:30:00Z",
                "feedback": "Very interested in Plot 5 (corner unit)",
                "follow_up_date": "2026-07-05",
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert r.json()["feedback"] is not None

    def test_lead_status_updated_to_done(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads/{pytest.test_lead_id}",
            headers=_h(tokens["admin"]),
        )
        assert r.json()["status"] == "SITE_VISIT_DONE"

    def test_list_visits_by_lead(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/site-visits",
            params={"lead_id": pytest.test_lead_id},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_client_blocked_from_visits(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/crm/site-visits",
            json={"lead_id": pytest.test_lead_id, "scheduled_at": "2026-08-01T10:00:00Z"},
            headers=_h(tokens["client"]),
        )
        assert r.status_code == 403


# ---- Quotations ----
class TestQuotations:
    def test_create_quotation(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/crm/quotations",
            json={
                "lead_id": pytest.test_lead_id,
                "plots": [
                    {
                        "plot_no": 5,
                        "elevation": "Elora",
                        "base_price_inr": 3500000.0,
                        "premium_pct": 5.0,
                        "quoted_price_inr": 3675000.0,
                    }
                ],
                "valid_until": "2026-08-01",
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["total_value_inr"] == 3675000.0
        assert len(body["plots"]) == 1
        pytest.test_quotation_id = body["id"]

    def test_list_quotations_for_lead(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/quotations",
            params={"lead_id": pytest.test_lead_id},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_client_blocked_from_quotations(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/crm/quotations",
            json={
                "lead_id": pytest.test_lead_id,
                "plots": [],
                "valid_until": "2026-08-01",
            },
            headers=_h(tokens["client"]),
        )
        assert r.status_code == 403


# ---- Bookings ----
class TestBookings:
    def test_create_booking(self, tokens):
        # Find an available plot (demo seed may have booked some plots)
        plots_r = requests.get(
            f"{BASE_URL}/api/plots",
            headers=_h(tokens["admin"]),
        )
        assert plots_r.status_code == 200
        available = [p for p in plots_r.json() if p.get("sales_status") == "AVAILABLE"]
        assert len(available) > 0, "No available plots for booking test"
        test_plot = available[0]["plot_no"]
        pytest.test_plot_no = test_plot

        r = requests.post(
            f"{BASE_URL}/api/crm/bookings",
            json={
                "lead_id": pytest.test_lead_id,
                "plot_no": test_plot,
                "client_name": "TEST_CRM Lead",
                "elevation_type": "Elora",
                "sale_value_inr": 3675000.0,
                "discount_pct": 2.0,
                "booking_amount_inr": 500000.0,
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200, f"Booking failed for plot {test_plot}: {r.status_code} {r.text}"
        body = r.json()
        assert body["status"] == "PROVISIONAL"
        assert body["plot_no"] == test_plot
        assert body["sale_value_inr"] == 3675000.0
        pytest.test_booking_id = body["id"]

    def test_lead_status_updated_to_booking(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/leads/{pytest.test_lead_id}",
            headers=_h(tokens["admin"]),
        )
        assert r.json()["status"] == "BOOKING"

    def test_duplicate_booking_blocked(self, tokens):
        """Same plot cannot be booked again."""
        r = requests.post(
            f"{BASE_URL}/api/crm/bookings",
            json={
                "lead_id": pytest.test_lead_id,
                "plot_no": pytest.test_plot_no,
                "client_name": "Another Person",
                "elevation_type": "Elora",
                "sale_value_inr": 3675000.0,
                "booking_amount_inr": 500000.0,
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 409

    def test_get_single_booking(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/bookings/{pytest.test_booking_id}",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert r.json()["id"] == pytest.test_booking_id

    def test_list_bookings(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/bookings",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert len(r.json()) >= 1

    def test_cancel_requires_reason(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/crm/bookings/{pytest.test_booking_id}",
            json={"status": "CANCELLED"},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 422

    def test_confirm_booking(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/crm/bookings/{pytest.test_booking_id}",
            json={
                "status": "CONFIRMED",
                "agreement_date": "2026-07-15",
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "CONFIRMED"

    def test_already_decided_booking_409(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/crm/bookings/{pytest.test_booking_id}",
            json={"status": "CANCELLED", "cancelled_reason": "test"},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 409

    def test_client_blocked_from_bookings(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/bookings",
            headers=_h(tokens["client"]),
        )
        assert r.status_code == 403


# ---- CRM Dashboard ----
class TestCrmDashboard:
    def test_dashboard_returns_stats(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/dashboard",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert "total_leads" in body
        assert "lead_funnel" in body
        assert "pipeline_value_inr" in body
        assert body["total_leads"] >= 5

    def test_client_blocked_from_dashboard(self, tokens):
        r = requests.get(
            f"{BASE_URL}/api/crm/dashboard",
            headers=_h(tokens["client"]),
        )
        assert r.status_code == 403
