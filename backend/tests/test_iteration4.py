"""Iteration 4 backend tests: GridFS files, Procurement PO lifecycle,
Approval workflow, Stage checklists, plus regression checks."""
import io
import os

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to reading frontend/.env (kept simple)
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].strip('"').rstrip("/")
                break

PROJECT_ID = "villa-aurelia-12"


# ---------------- fixtures: auth tokens ---------------- #
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
        "manager": _login("manager@regalpark.com", "Manager@123"),
        "site": _login("siteengineer@regalpark.com", "Site@123"),
        "procurement": _login("procurement@regalpark.com", "Procure@123"),
        "qs": _login("qs@regalpark.com", "Qs@123"),
    }


# ---------------- Auth ---------------- #
class TestAuth:
    def test_admin_login_returns_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "admin@regalpark.com", "password": "Admin@123"})
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body and body["token_type"] == "bearer"

    def test_client_login_returns_token(self):
        r = requests.post(f"{BASE_URL}/api/auth/login",
                          json={"email": "client@regalpark.com", "password": "Client@123"})
        assert r.status_code == 200
        assert "access_token" in r.json()


# ---------------- Procurement / PO lifecycle ---------------- #
class TestPurchaseOrders:
    def test_admin_lists_pos(self, tokens):
        r = requests.get(f"{BASE_URL}/api/purchase-orders",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list) and len(rows) >= 5
        # seeded PO numbers PO-RPV-101..105
        nums = {r_["po_number"] for r_ in rows}
        assert any(n.startswith("PO-RPV-1") for n in nums)

    def test_client_blocked_from_pos(self, tokens):
        r = requests.get(f"{BASE_URL}/api/purchase-orders",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["client"]))
        assert r.status_code == 403

    def test_create_po_status_requested_with_po_number(self, tokens):
        payload = {
            "project_id": PROJECT_ID,
            "material_name": "TEST_iter4 — Cement OPC 53",
            "vendor": "Ultratech",
            "quantity": 100,
            "unit": "bags",
            "rate_inr": 380,
            "expected_delivery": "2026-08-01",
            "notes": "iter4 lifecycle test",
        }
        r = requests.post(f"{BASE_URL}/api/purchase-orders",
                          json=payload, headers=_h(tokens["admin"]))
        assert r.status_code == 200, r.text
        po = r.json()
        assert po["status"] == "REQUESTED"
        assert po["po_number"].startswith("PO-RPV-")
        assert po["total_inr"] == 38000.0
        assert po["requested_by"]
        # store for next tests
        pytest.po_id = po["id"]
        pytest.po_initial = po

    def test_site_engineer_cannot_approve(self, tokens):
        assert getattr(pytest, "po_id", None)
        r = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{pytest.po_id}/transition",
            json={"action": "approve", "note": "should fail"},
            headers=_h(tokens["site"]),
        )
        assert r.status_code == 403

    def test_invalid_transition_409(self, tokens):
        # ORDER directly from REQUESTED (skip APPROVE) => 409 ("Cannot order a PO in status REQUESTED")
        r = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{pytest.po_id}/transition",
            json={"action": "order", "note": "invalid skip"},
            headers=_h(tokens["procurement"]),
        )
        assert r.status_code == 409

    def test_admin_approves(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{pytest.po_id}/transition",
            json={"action": "approve", "note": "ok admin"},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "APPROVED"

    def test_procurement_orders(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{pytest.po_id}/transition",
            json={"action": "order"},
            headers=_h(tokens["procurement"]),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "ORDERED"

    def test_deliver(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{pytest.po_id}/transition",
            json={"action": "deliver", "note": "received"},
            headers=_h(tokens["procurement"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "DELIVERED"
        # 4-entry history (REQUESTED + 3 transitions)
        assert len(body["history"]) >= 4

    def test_terminal_no_more_transitions(self, tokens):
        r = requests.patch(
            f"{BASE_URL}/api/purchase-orders/{pytest.po_id}/transition",
            json={"action": "cancel"},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 409


# ---------------- Approval workflow ---------------- #
class TestApprovalWorkflow:
    def test_admin_sees_all_requests(self, tokens):
        r = requests.get(f"{BASE_URL}/api/approval-requests",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 4
        roles = {r_["assignee_role"] for r_ in rows}
        assert "CLIENT" in roles and "PROJECT_DIRECTOR" in roles

    def test_client_sees_only_client_assigned(self, tokens):
        r = requests.get(f"{BASE_URL}/api/approval-requests",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["client"]))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        assert all(r_["assignee_role"] == "CLIENT" for r_ in rows)
        pending_client = [r_ for r_ in rows if r_["status"] == "PENDING"]
        assert any("Sanitaryware" in r_["title"] for r_ in pending_client)
        pytest.client_pending_id = pending_client[0]["id"]

    def test_admin_creates_pending_request(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/approval-requests",
            json={
                "project_id": PROJECT_ID,
                "title": "TEST_iter4 — Façade lighting selection",
                "description": "iter4 request creation",
                "category": "CLIENT_SELECTION",
                "assignee_role": "CLIENT",
            },
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "PENDING"
        assert body["assignee_role"] == "CLIENT"
        pytest.created_req_id = body["id"]

    def test_client_cannot_decide_internal_request(self, tokens):
        # find a non-CLIENT assigned PENDING request
        r = requests.get(f"{BASE_URL}/api/approval-requests",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        non_client_pending = [
            x for x in r.json() if x["assignee_role"] != "CLIENT" and x["status"] == "PENDING"
        ]
        assert non_client_pending, "expected at least one non-client pending request"
        target = non_client_pending[0]["id"]
        r2 = requests.patch(
            f"{BASE_URL}/api/approval-requests/{target}/decide",
            json={"decision": "APPROVED"}, headers=_h(tokens["client"]),
        )
        assert r2.status_code == 403

    def test_client_can_decide_client_request(self, tokens):
        rid = pytest.created_req_id
        r = requests.patch(
            f"{BASE_URL}/api/approval-requests/{rid}/decide",
            json={"decision": "APPROVED", "note": "iter4 client approved"},
            headers=_h(tokens["client"]),
        )
        assert r.status_code == 200
        assert r.json()["status"] == "APPROVED"

    def test_decide_already_decided_returns_409(self, tokens):
        rid = pytest.created_req_id
        r = requests.patch(
            f"{BASE_URL}/api/approval-requests/{rid}/decide",
            json={"decision": "REJECTED"}, headers=_h(tokens["admin"]),
        )
        assert r.status_code == 409


# ---------------- Stage checklists ---------------- #
class TestChecklists:
    def test_list_templates_admin(self, tokens):
        r = requests.get(f"{BASE_URL}/api/checklist-templates", headers=_h(tokens["admin"]))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 8
        names = {t["stage_name"] for t in rows}
        assert {"Foundation", "Slab", "Masonry"} <= names

    def test_client_blocked_from_templates(self, tokens):
        r = requests.get(f"{BASE_URL}/api/checklist-templates", headers=_h(tokens["client"]))
        assert r.status_code == 403

    def test_seeded_checklists_present(self, tokens):
        r = requests.get(f"{BASE_URL}/api/stage-checklists",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        assert r.status_code == 200
        rows = r.json()
        names = {c["stage_name"]: c for c in rows}
        assert "Foundation" in names and names["Foundation"]["signed_off"] is True
        assert "Masonry" in names and names["Masonry"]["signed_off"] is False
        pytest.masonry_id = names["Masonry"]["id"]
        pytest.foundation_id = names["Foundation"]["id"]

    def test_instantiate_from_template(self, tokens):
        # use 'Slab' — no existing checklist (or 'Plastering' as fallback)
        for stage in ("Slab", "Plastering", "Flooring"):
            r = requests.post(
                f"{BASE_URL}/api/stage-checklists",
                json={"project_id": PROJECT_ID, "stage_name": stage},
                headers=_h(tokens["admin"]),
            )
            if r.status_code == 200:
                pytest.new_cl_id = r.json()["id"]
                pytest.new_cl_stage = stage
                assert r.json()["signed_off"] is False
                assert len(r.json()["items"]) >= 1
                return
        pytest.fail("Could not instantiate any new checklist")

    def test_duplicate_instantiate_returns_409(self, tokens):
        r = requests.post(
            f"{BASE_URL}/api/stage-checklists",
            json={"project_id": PROJECT_ID, "stage_name": pytest.new_cl_stage},
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 409

    def test_item_toggle(self, tokens):
        # get items for new checklist
        r = requests.get(f"{BASE_URL}/api/stage-checklists",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        cl = next(c for c in r.json() if c["id"] == pytest.new_cl_id)
        first_item = cl["items"][0]["id"]
        r2 = requests.patch(
            f"{BASE_URL}/api/stage-checklists/{pytest.new_cl_id}/items/{first_item}",
            json={"status": "PASS", "remarks": "iter4 ok"},
            headers=_h(tokens["admin"]),
        )
        assert r2.status_code == 200
        updated = next(i for i in r2.json()["items"] if i["id"] == first_item)
        assert updated["status"] == "PASS"

    def test_signed_off_checklist_locks_items(self, tokens):
        # Foundation is signed_off=True — items must be locked
        r = requests.get(f"{BASE_URL}/api/stage-checklists",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        foundation = next(c for c in r.json() if c["id"] == pytest.foundation_id)
        item_id = foundation["items"][0]["id"]
        r2 = requests.patch(
            f"{BASE_URL}/api/stage-checklists/{pytest.foundation_id}/items/{item_id}",
            json={"status": "FAIL"},
            headers=_h(tokens["admin"]),
        )
        assert r2.status_code == 409

    def test_signoff_blocks_when_not_all_pass(self, tokens):
        # Masonry has FAIL & PENDING items
        r = requests.post(
            f"{BASE_URL}/api/stage-checklists/{pytest.masonry_id}/sign-off",
            headers=_h(tokens["admin"]),
        )
        assert r.status_code == 409

    def test_client_blocked_on_item_patch_and_signoff(self, tokens):
        r = requests.get(f"{BASE_URL}/api/stage-checklists",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        cl = next(c for c in r.json() if c["id"] == pytest.new_cl_id)
        first_item = cl["items"][0]["id"]
        r2 = requests.patch(
            f"{BASE_URL}/api/stage-checklists/{pytest.new_cl_id}/items/{first_item}",
            json={"status": "PASS"}, headers=_h(tokens["client"]),
        )
        assert r2.status_code == 403
        r3 = requests.post(
            f"{BASE_URL}/api/stage-checklists/{pytest.new_cl_id}/sign-off",
            headers=_h(tokens["client"]),
        )
        assert r3.status_code == 403

    def test_signoff_succeeds_when_all_pass(self, tokens):
        # mark all items PASS on new_cl_id then sign off
        r = requests.get(f"{BASE_URL}/api/stage-checklists",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        cl = next(c for c in r.json() if c["id"] == pytest.new_cl_id)
        for it in cl["items"]:
            r2 = requests.patch(
                f"{BASE_URL}/api/stage-checklists/{pytest.new_cl_id}/items/{it['id']}",
                json={"status": "PASS"}, headers=_h(tokens["admin"]),
            )
            assert r2.status_code == 200
        r3 = requests.post(
            f"{BASE_URL}/api/stage-checklists/{pytest.new_cl_id}/sign-off",
            headers=_h(tokens["admin"]),
        )
        assert r3.status_code == 200
        assert r3.json()["signed_off"] is True


# ---------------- GridFS file upload/download ---------------- #
class TestFiles:
    def test_admin_upload_returns_id_and_url(self, tokens):
        files = {"file": ("test_iter4.txt", io.BytesIO(b"iter4-content"), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/files", files=files, headers=_h(tokens["admin"]))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "id" in body and body["url"].startswith("/api/files/")
        assert body["content_type"] == "text/plain"
        assert body["size"] == len(b"iter4-content")
        pytest.file_id = body["id"]
        pytest.file_url = body["url"]

    def test_client_cannot_upload(self, tokens):
        files = {"file": ("client_blocked.txt", io.BytesIO(b"nope"), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/files", files=files, headers=_h(tokens["client"]))
        assert r.status_code == 403

    def test_download_with_query_token(self, tokens):
        r = requests.get(
            f"{BASE_URL}{pytest.file_url}",
            params={"token": tokens["admin"]},
        )
        assert r.status_code == 200
        assert r.content == b"iter4-content"
        assert "text/plain" in r.headers.get("content-type", "")

    def test_download_with_header_token(self, tokens):
        r = requests.get(f"{BASE_URL}{pytest.file_url}", headers=_h(tokens["client"]))
        # client can DOWNLOAD any file (read flexible) — accept 200
        assert r.status_code == 200
        assert r.content == b"iter4-content"

    def test_download_no_token_401(self):
        r = requests.get(f"{BASE_URL}{pytest.file_url}")
        assert r.status_code == 401


# ---------------- Documents (GridFS migration) ---------------- #
class TestDocuments:
    def test_documents_have_file_url_no_base64(self, tokens):
        r = requests.get(f"{BASE_URL}/api/documents",
                         params={"project_id": PROJECT_ID, "limit": 20},
                         headers=_h(tokens["admin"]))
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 5
        for item in body["items"]:
            assert "file_data" not in item
            assert item["file_url"].startswith("/api/files/") or item["file_url"] == ""


# ---------------- Regression: dashboard / RBAC / PDF ---------------- #
class TestRegression:
    def test_dashboard_summary_admin(self, tokens):
        r = requests.get(f"{BASE_URL}/api/dashboard/summary",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        assert r.status_code == 200

    def test_client_blocked_on_boq(self, tokens):
        r = requests.get(f"{BASE_URL}/api/boq",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["client"]))
        assert r.status_code == 403

    def test_client_blocked_on_billing(self, tokens):
        r = requests.get(f"{BASE_URL}/api/billing",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["client"]))
        assert r.status_code == 403

    def test_team_pii_scrubbed_for_client(self, tokens):
        r = requests.get(f"{BASE_URL}/api/team",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["client"]))
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) >= 1
        for m in rows:
            assert m["phone"] == "—" and m["email"] == "—"

    def test_progress_pdf(self, tokens):
        r = requests.get(f"{BASE_URL}/api/reports/progress",
                         params={"project_id": PROJECT_ID}, headers=_h(tokens["admin"]))
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content.startswith(b"%PDF")


# ---------------- Cleanup ---------------- #
def teardown_module(module):
    """Delete TEST_iter4 PO and approval requests."""
    try:
        tok = _login("admin@regalpark.com", "Admin@123")
        # no direct delete endpoint for PO/approval-request — leave them, prefixed TEST_iter4
        # delete uploaded test file? no DELETE endpoint either — acceptable, small payload
        _ = tok
    except Exception:
        pass
