"""Regal Park Villas - Iteration 3 backend tests.

Covers:
- /api/team PII scrubbing for CLIENT role (phone/email = '—')
- /api/documents pagination (items, total, limit, skip, has_more) + newest-first
- Regression of iter1+iter2 RBAC behaviour
- PDF brand line contains 'STERLITEE DEVELOPERS LLP' / 'REGAL PARK VILLAS'
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
PROJECT_ID = "villa-aurelia-12"

ADMIN_EMAIL, ADMIN_PW = "admin@regalpark.com", "Admin@123"
CLIENT_EMAIL, CLIENT_PW = "client@regalpark.com", "Client@123"
SE_EMAIL, SE_PW = "siteengineer@regalpark.com", "Site@123"


def _token(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def h_admin():
    return {"Authorization": f"Bearer {_token(ADMIN_EMAIL, ADMIN_PW)}"}


@pytest.fixture(scope="module")
def h_client():
    return {"Authorization": f"Bearer {_token(CLIENT_EMAIL, CLIENT_PW)}"}


@pytest.fixture(scope="module")
def h_se():
    return {"Authorization": f"Bearer {_token(SE_EMAIL, SE_PW)}"}


# ---------------- Team PII scrubbing ----------------
class TestTeamPII:
    def test_admin_sees_real_pii(self, h_admin):
        r = requests.get(f"{BASE_URL}/api/team?project_id={PROJECT_ID}", headers=h_admin, timeout=30)
        assert r.status_code == 200
        members = r.json()
        assert len(members) > 0
        for m in members:
            assert m["phone"] != "—", f"admin should see real phone, got: {m['phone']}"
            assert m["email"] != "—", f"admin should see real email, got: {m['email']}"
        # at least one phone matches +91 pattern
        assert any(re.match(r"^\+91", m["phone"]) for m in members)

    def test_client_sees_scrubbed_pii(self, h_client):
        r = requests.get(f"{BASE_URL}/api/team?project_id={PROJECT_ID}", headers=h_client, timeout=30)
        assert r.status_code == 200
        members = r.json()
        assert len(members) > 0
        for m in members:
            assert m["phone"] == "—", f"client phone should be scrubbed, got: {m['phone']}"
            assert m["email"] == "—", f"client email should be scrubbed, got: {m['email']}"
            # name/company/role/scope must remain
            assert m["name"] and m["company"] and m["role"]


# ---------------- Documents pagination ----------------
class TestDocumentsPagination:
    def test_pagination_first_page(self, h_admin):
        r = requests.get(
            f"{BASE_URL}/api/documents?project_id={PROJECT_ID}&limit=3&skip=0",
            headers=h_admin, timeout=30
        )
        assert r.status_code == 200
        body = r.json()
        assert isinstance(body, dict), f"expected paginated dict, got {type(body)}"
        for key in ("items", "total", "limit", "skip", "has_more"):
            assert key in body, f"missing key {key} in response"
        assert body["limit"] == 3
        assert body["skip"] == 0
        assert body["total"] >= 5
        assert len(body["items"]) == 3
        assert body["has_more"] is True

    def test_pagination_second_page(self, h_admin):
        r = requests.get(
            f"{BASE_URL}/api/documents?project_id={PROJECT_ID}&limit=3&skip=3",
            headers=h_admin, timeout=30
        )
        assert r.status_code == 200
        body = r.json()
        assert body["skip"] == 3
        assert body["total"] >= 5
        # has_more should be False once skip+items covers total. For total=5 limit=3 skip=3 -> 2 items, has_more=False
        if body["total"] == 5:
            assert len(body["items"]) == 2
            assert body["has_more"] is False

    def test_newest_first_after_post(self, h_admin):
        # create new doc and ensure it appears first
        payload = {
            "project_id": PROJECT_ID,
            "title": "TEST_iter3 newest",
            "category": "OTHER",
            "drawing_number": "TST-NEW",
            "revision": "R0",
            "file_data": "data:application/pdf;base64,JVBERi0xLjAK",
            "file_name": "newest.pdf",
        }
        post = requests.post(f"{BASE_URL}/api/documents", headers=h_admin, json=payload, timeout=30)
        assert post.status_code == 200, post.text
        new_id = post.json()["id"]

        try:
            r = requests.get(
                f"{BASE_URL}/api/documents?project_id={PROJECT_ID}&limit=10&skip=0",
                headers=h_admin, timeout=30
            )
            assert r.status_code == 200
            items = r.json()["items"]
            assert items[0]["id"] == new_id, "newest document should be first"
        finally:
            requests.delete(f"{BASE_URL}/api/documents/{new_id}", headers=h_admin, timeout=30)


# ---------------- RBAC regressions (iter1+iter2) ----------------
class TestRBACRegression:
    @pytest.mark.parametrize("endpoint", [
        "/api/boq", "/api/billing", "/api/materials", "/api/dashboard/summary",
    ])
    def test_client_forbidden(self, h_client, endpoint):
        r = requests.get(f"{BASE_URL}{endpoint}", headers=h_client, timeout=30)
        assert r.status_code == 403

    @pytest.mark.parametrize("endpoint", [
        "/api/projects", "/api/stages", "/api/snags", "/api/quality",
        "/api/team", "/api/approvals", "/api/site-reports", "/api/documents",
    ])
    def test_client_allowed_reads(self, h_client, endpoint):
        r = requests.get(f"{BASE_URL}{endpoint}", headers=h_client, timeout=30)
        assert r.status_code == 200

    def test_client_cannot_patch_quality(self, h_admin, h_client):
        qc_id = requests.get(f"{BASE_URL}/api/quality", headers=h_admin, timeout=30).json()[0]["id"]
        r = requests.patch(f"{BASE_URL}/api/quality/{qc_id}", headers=h_client,
                           json={"result": "PASS"}, timeout=30)
        assert r.status_code == 403

    def test_client_cannot_post_documents(self, h_client):
        r = requests.post(f"{BASE_URL}/api/documents", headers=h_client, json={
            "project_id": PROJECT_ID, "title": "TEST_x", "category": "OTHER",
            "file_data": "data:text/plain;base64,QUJD", "file_name": "x.txt",
        }, timeout=30)
        assert r.status_code == 403

    def test_se_can_create_site_report(self, h_se):
        r = requests.post(f"{BASE_URL}/api/site-reports", headers=h_se, json={
            "project_id": PROJECT_ID, "date": "2026-06-01", "labour_count": 30,
            "work_completed": "TEST_iter3", "materials_received": "n/a",
            "machinery_used": "n/a", "tomorrow_plan": "continue", "weather": "Sunny",
            "photos": [],
        }, timeout=30)
        assert r.status_code == 200


# ---------------- PDF brand line ----------------
class TestPDFBranding:
    @pytest.mark.parametrize("kind", ["progress", "cost", "delay", "safety"])
    def test_pdf_branding(self, h_admin, kind):
        r = requests.get(
            f"{BASE_URL}/api/reports/{kind}?project_id={PROJECT_ID}",
            headers=h_admin, timeout=60
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"
        # Extract text via pypdf
        try:
            from pypdf import PdfReader
            from io import BytesIO
            reader = PdfReader(BytesIO(r.content))
            text = "\n".join(p.extract_text() or "" for p in reader.pages)
        except ImportError:
            # fallback: search raw bytes (reportlab embeds text in content streams; may be wrapped)
            text = r.content.decode("latin-1", errors="ignore")
        assert "STERLITEE DEVELOPERS LLP" in text.upper() or "STERLITEE" in text.upper(), \
            f"brand line missing in {kind} PDF"
        assert "REGAL PARK VILLAS" in text.upper(), f"REGAL PARK VILLAS missing in {kind} PDF"


# ---------------- Health / JWT_SECRET env ----------------
class TestHealth:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/api/", timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert "Regal Park" in body.get("app", "")
