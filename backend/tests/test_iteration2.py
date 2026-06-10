"""Regal Park Villas - Iteration 2 backend tests (RBAC, photos, documents, PDFs)."""
import os
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


# ---------------- Multi-project seed ----------------
class TestProjects:
    def test_three_villas(self, h_admin):
        r = requests.get(f"{BASE_URL}/api/projects", headers=h_admin, timeout=30)
        assert r.status_code == 200
        data = r.json()
        names = sorted(p["name"] for p in data)
        assert len(data) == 3, f"expected 3 projects, got {len(data)}: {names}"
        assert names == ["Villa Aurelia", "Villa Celeste", "Villa Meridian"]
        ids = {p["id"] for p in data}
        assert {"villa-aurelia-12", "villa-celeste-08", "villa-meridian-05"} <= ids


# ---------------- Client RBAC (denied) ----------------
class TestClientForbidden:
    @pytest.mark.parametrize("endpoint", [
        "/api/boq", "/api/billing", "/api/materials", "/api/dashboard/summary",
    ])
    def test_client_get_forbidden(self, h_client, endpoint):
        r = requests.get(f"{BASE_URL}{endpoint}", headers=h_client, timeout=30)
        assert r.status_code == 403, f"{endpoint} expected 403 got {r.status_code}"


# ---------------- Client RBAC (allowed for transparency) ----------------
class TestClientAllowed:
    @pytest.mark.parametrize("endpoint", [
        "/api/projects", "/api/stages", "/api/snags", "/api/quality",
        "/api/team", "/api/approvals", "/api/site-reports", "/api/documents",
    ])
    def test_client_get_allowed(self, h_client, endpoint):
        r = requests.get(f"{BASE_URL}{endpoint}", headers=h_client, timeout=30)
        assert r.status_code == 200, f"{endpoint} expected 200 got {r.status_code}: {r.text[:200]}"


# ---------------- Client RBAC (mutations denied) ----------------
class TestClientMutationsForbidden:
    def test_client_cannot_patch_quality(self, h_admin, h_client):
        r = requests.get(f"{BASE_URL}/api/quality", headers=h_admin, timeout=30)
        qc_id = r.json()[0]["id"]
        r2 = requests.patch(f"{BASE_URL}/api/quality/{qc_id}", headers=h_client,
                            json={"result": "PASS"}, timeout=30)
        assert r2.status_code == 403, f"got {r2.status_code}: {r2.text[:200]}"

    def test_client_cannot_patch_snag(self, h_admin, h_client):
        r = requests.get(f"{BASE_URL}/api/snags", headers=h_admin, timeout=30)
        snag_id = r.json()[0]["id"]
        r2 = requests.patch(f"{BASE_URL}/api/snags/{snag_id}", headers=h_client,
                            json={"status": "OPEN"}, timeout=30)
        assert r2.status_code == 403

    def test_client_cannot_post_documents(self, h_client):
        payload = {
            "project_id": PROJECT_ID, "title": "TEST_unauth",
            "category": "OTHER", "file_data": "data:text/plain;base64,QUJD",
            "file_name": "x.txt",
        }
        r = requests.post(f"{BASE_URL}/api/documents", headers=h_client, json=payload, timeout=30)
        assert r.status_code == 403


# ---------------- Site Engineer writes ----------------
class TestSiteEngineerWrites:
    def test_create_site_report_with_photos(self, h_se):
        photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy7n2sAAAAASUVORK5CYII="
        payload = {
            "project_id": PROJECT_ID,
            "date": "2026-05-16",
            "labour_count": 60,
            "work_completed": "TEST_iter2 photo upload",
            "materials_received": "TEST_iter2 batch",
            "machinery_used": "Cutter",
            "tomorrow_plan": "Continue",
            "weather": "Sunny",
            "safety_observations": "OK",
            "photos": [photo, photo],
        }
        r = requests.post(f"{BASE_URL}/api/site-reports", headers=h_se, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["photos"]) == 2
        new_id = body["id"]
        # verify persistence via GET
        r2 = requests.get(f"{BASE_URL}/api/site-reports", headers=h_se, timeout=30)
        found = next((x for x in r2.json() if x["id"] == new_id), None)
        assert found and len(found["photos"]) == 2

    def test_se_can_patch_quality(self, h_admin, h_se):
        r = requests.get(f"{BASE_URL}/api/quality", headers=h_admin, timeout=30)
        qc = r.json()[0]
        original = qc["result"]
        new_result = "FAIL" if original != "FAIL" else "PASS"
        r2 = requests.patch(f"{BASE_URL}/api/quality/{qc['id']}", headers=h_se,
                            json={"result": new_result}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["result"] == new_result
        # revert
        requests.patch(f"{BASE_URL}/api/quality/{qc['id']}", headers=h_se, json={"result": original}, timeout=30)

    def test_se_patch_snag_appends_photos(self, h_admin, h_se):
        r = requests.get(f"{BASE_URL}/api/snags", headers=h_admin, timeout=30)
        snag = r.json()[0]
        photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zy7n2sAAAAASUVORK5CYII="
        r2 = requests.patch(f"{BASE_URL}/api/snags/{snag['id']}", headers=h_se,
                            json={"photos": [photo]}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert len(r2.json()["photos"]) >= 1


# ---------------- Documents CRUD ----------------
class TestDocuments:
    def test_documents_create_get_delete(self, h_admin):
        payload = {
            "project_id": PROJECT_ID,
            "title": "TEST_iter2 doc",
            "category": "OTHER",
            "drawing_number": "TST-001",
            "revision": "R0",
            "file_data": "data:application/pdf;base64,JVBERi0xLjAK",
            "file_name": "test.pdf",
        }
        r = requests.post(f"{BASE_URL}/api/documents", headers=h_admin, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc_id = r.json()["id"]
        # GET
        r2 = requests.get(f"{BASE_URL}/api/documents", headers=h_admin, timeout=30)
        ids = [d["id"] for d in r2.json()]
        assert doc_id in ids
        # DELETE
        r3 = requests.delete(f"{BASE_URL}/api/documents/{doc_id}", headers=h_admin, timeout=30)
        assert r3.status_code == 200
        # verify gone
        r4 = requests.get(f"{BASE_URL}/api/documents", headers=h_admin, timeout=30)
        assert doc_id not in [d["id"] for d in r4.json()]

    def test_seeded_documents_for_aurelia(self, h_admin):
        r = requests.get(f"{BASE_URL}/api/documents?project_id={PROJECT_ID}", headers=h_admin, timeout=30)
        assert r.status_code == 200
        docs = r.json()
        # seed has 5 sample docs
        assert len(docs) >= 5, f"expected >=5 seeded docs, got {len(docs)}"


# ---------------- PDF Reports ----------------
class TestPDFReports:
    @pytest.mark.parametrize("kind", ["progress", "cost", "delay", "safety"])
    def test_pdf_report(self, h_admin, kind):
        r = requests.get(f"{BASE_URL}/api/reports/{kind}?project_id={PROJECT_ID}",
                         headers=h_admin, timeout=60)
        assert r.status_code == 200, f"{kind} -> {r.status_code} {r.text[:200]}"
        assert r.headers.get("content-type", "").startswith("application/pdf"), \
            f"{kind} content-type: {r.headers.get('content-type')}"
        assert len(r.content) > 500, f"{kind} pdf empty/small ({len(r.content)} bytes)"
        assert r.content[:4] == b"%PDF", f"{kind} not a PDF: {r.content[:8]}"

    def test_pdf_no_token(self):
        r = requests.get(f"{BASE_URL}/api/reports/progress?project_id={PROJECT_ID}", timeout=30)
        assert r.status_code == 401

    def test_pdf_client_forbidden(self, h_client):
        r = requests.get(f"{BASE_URL}/api/reports/progress?project_id={PROJECT_ID}",
                         headers=h_client, timeout=30)
        assert r.status_code == 403

    def test_pdf_unknown_kind(self, h_admin):
        r = requests.get(f"{BASE_URL}/api/reports/unknown?project_id={PROJECT_ID}",
                         headers=h_admin, timeout=30)
        assert r.status_code == 404
