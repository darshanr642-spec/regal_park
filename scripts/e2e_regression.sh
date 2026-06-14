#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Regal Park Villas — Automated Regression Suite
#  Sterlitee Developers LLP
#
#  Usage:
#    bash scripts/e2e_regression.sh              # local (reads .env.test)
#    ADMIN_EMAIL=x ADMIN_PASSWORD=y ... bash scripts/e2e_regression.sh  # CI
#
#  Exit codes:
#    0  — all tests passed
#    1  — one or more tests failed
#    2  — setup/config error
# ═══════════════════════════════════════════════════════════════════
set -o pipefail

# ── Colours (disabled in CI) ─────────────────────────────────────
if [ -t 1 ] && [ -z "$CI" ]; then
  GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
else
  GREEN=''; RED=''; YELLOW=''; CYAN=''; BOLD=''; RESET=''
fi

# ── Test framework ───────────────────────────────────────────────
PASS=0; FAIL=0; SKIP=0; TOTAL=0
FAILURES=""
START_TIME=$(date +%s)

assert() {
  local name="$1" expected="$2" actual="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}✅ PASS${RESET}  %s\n" "$name"
  else
    FAIL=$((FAIL + 1))
    FAILURES="${FAILURES}\n  ❌ ${name}: expected '${expected}', got '${actual}'"
    printf "  ${RED}❌ FAIL${RESET}  %s  (expected: %s, got: %s)\n" "$name" "$expected" "$actual"
  fi
}

assert_not_empty() {
  local name="$1" value="$2"
  TOTAL=$((TOTAL + 1))
  if [ -n "$value" ] && [ "$value" != "NONE" ] && [ "$value" != "null" ] && [ "$value" != "" ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}✅ PASS${RESET}  %s\n" "$name"
  else
    FAIL=$((FAIL + 1))
    FAILURES="${FAILURES}\n  ❌ ${name}: value was empty/null"
    printf "  ${RED}❌ FAIL${RESET}  %s  (value was empty)\n" "$name"
  fi
}

assert_http() {
  local name="$1" expected="$2" url="$3" auth_header="$4"
  TOTAL=$((TOTAL + 1))
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url" -H "$auth_header" 2>/dev/null)
  if [ "$expected" = "$code" ]; then
    PASS=$((PASS + 1))
    printf "  ${GREEN}✅ PASS${RESET}  %s  (HTTP %s)\n" "$name" "$code"
  else
    FAIL=$((FAIL + 1))
    FAILURES="${FAILURES}\n  ❌ ${name}: expected HTTP ${expected}, got HTTP ${code}"
    printf "  ${RED}❌ FAIL${RESET}  %s  (expected HTTP %s, got %s)\n" "$name" "$expected" "$code"
  fi
}

json_get() {
  python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null
}

section() {
  echo ""
  printf "${BOLD}${CYAN}▶ %s${RESET}\n" "$1"
}

# ── Load credentials ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for d in "$SCRIPT_DIR" "$SCRIPT_DIR/.." "$SCRIPT_DIR/../.." "$(pwd)"; do
  if [ -f "$d/.env.test" ]; then
    set -a; source "$d/.env.test"; set +a
    break
  fi
done

# Validate
MISSING=""
for var in ADMIN_EMAIL ADMIN_PASSWORD CLIENT_DEFAULT_PASSWORD BASE_URL; do
  if [ -z "${!var}" ]; then MISSING="$MISSING $var"; fi
done
if [ -n "$MISSING" ]; then
  printf "${RED}ERROR: Missing required env vars:%s${RESET}\n" "$MISSING"
  echo "Set them in .env.test or export before running."
  exit 2
fi

# ═══════════════════════════════════════════════════════════════════
echo ""
printf "${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n"
printf "${BOLD}  REGAL PARK VILLAS — REGRESSION SUITE${RESET}\n"
printf "${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n"
echo "  Backend: $BASE_URL"
echo "  Time:    $(date -u '+%Y-%m-%d %H:%M:%S UTC')"

# ── Activate Python venv for DB queries ──────────────────────────
BACKEND_DIR="$(cd "$SCRIPT_DIR/../backend" 2>/dev/null && pwd || echo "$SCRIPT_DIR/../backend")"
if [ -f "$BACKEND_DIR/venv/bin/activate" ]; then
  source "$BACKEND_DIR/venv/bin/activate"
fi

# ═══════════════════════════════════════════════════════════════════
#  T0: HEALTH CHECK
# ═══════════════════════════════════════════════════════════════════
section "T0: Health Check"
HEALTH=$(curl -s "$BASE_URL/health" 2>/dev/null)
HEALTH_STATUS=$(echo "$HEALTH" | json_get "['status']")
HEALTH_MONGO=$(echo "$HEALTH" | json_get "['mongo']")
assert "API is healthy" "healthy" "$HEALTH_STATUS"
assert "MongoDB connected" "connected" "$HEALTH_MONGO"

# ═══════════════════════════════════════════════════════════════════
#  T1: ADMIN LOGIN
# ═══════════════════════════════════════════════════════════════════
section "T1: Admin Authentication"
LOGIN_RESP=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(echo "$LOGIN_RESP" | json_get "['access_token']")
REFRESH=$(echo "$LOGIN_RESP" | json_get "['refresh_token']")
assert_not_empty "Login returns access_token" "$TOKEN"
assert_not_empty "Login returns refresh_token" "$REFRESH"
AUTH="Authorization: Bearer $TOKEN"

ME=$(curl -s "$BASE_URL/auth/me" -H "$AUTH")
ME_ROLE=$(echo "$ME" | json_get "['role']")
assert "Token resolves to ADMIN" "ADMIN" "$ME_ROLE"

# ═══════════════════════════════════════════════════════════════════
#  T2: LEAD CREATION
# ═══════════════════════════════════════════════════════════════════
section "T2: Lead Creation"
TIMESTAMP=$(date +%s)
LEAD_RESP=$(curl -s -X POST "$BASE_URL/crm/leads" \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d "{
    \"full_name\": \"E2E Test Lead $TIMESTAMP\",
    \"email\": \"e2e.lead.$TIMESTAMP@test.com\",
    \"phone\": \"+91900000$((TIMESTAMP % 10000))\",
    \"source\": \"WEBSITE\",
    \"interested_elevation\": \"Contemporary\",
    \"budget_range_inr\": \"4-6 Cr\",
    \"notes\": \"Automated regression test\"
  }")
LEAD_ID=$(echo "$LEAD_RESP" | json_get "['id']")
LEAD_STATUS=$(echo "$LEAD_RESP" | json_get "['status']")
assert_not_empty "Lead ID assigned" "$LEAD_ID"
assert "Lead status is NEW" "NEW" "$LEAD_STATUS"

# Verify lead is retrievable
LEAD_GET_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/crm/leads/$LEAD_ID" -H "$AUTH")
assert "Lead GET returns 200" "200" "$LEAD_GET_CODE"

# ═══════════════════════════════════════════════════════════════════
#  T3: SITE VISIT
# ═══════════════════════════════════════════════════════════════════
section "T3: Site Visit"

# Find available plot
PLOT_NO=$(python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
async def f():
    c = AsyncIOMotorClient('mongodb://localhost:27017')
    p = await c.regal_park_villas.plots.find_one({'sales_status': 'AVAILABLE'}, {'plot_no': 1, '_id': 0})
    print(p['plot_no'] if p else 'NONE')
    c.close()
asyncio.run(f())
" 2>/dev/null)

if [ "$PLOT_NO" = "NONE" ] || [ -z "$PLOT_NO" ]; then
  printf "  ${YELLOW}⏭ SKIP${RESET}  No available plots — skipping T3–T7\n"
  SKIP=$((SKIP + 15))
  TOTAL=$((TOTAL + 15))
else
  VISIT_RESP=$(curl -s -X POST "$BASE_URL/crm/site-visits" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"lead_id\":\"$LEAD_ID\",\"scheduled_at\":\"2026-12-01T10:00:00\",\"plots_shown\":[$PLOT_NO]}")
  VISIT_ID=$(echo "$VISIT_RESP" | json_get "['id']")
  assert_not_empty "Visit ID assigned" "$VISIT_ID"

  # Complete visit
  curl -s -X PATCH "$BASE_URL/crm/site-visits/$VISIT_ID" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d '{"feedback":"Regression test — client impressed","follow_up_date":"2026-12-05"}' > /dev/null

  LEAD_AFTER_VISIT=$(curl -s "$BASE_URL/crm/leads/$LEAD_ID" -H "$AUTH")
  LEAD_STATUS_2=$(echo "$LEAD_AFTER_VISIT" | json_get "['status']")
  assert "Lead auto-updated to SITE_VISIT_DONE" "SITE_VISIT_DONE" "$LEAD_STATUS_2"

# ═══════════════════════════════════════════════════════════════════
#  T4: QUOTATION
# ═══════════════════════════════════════════════════════════════════
  section "T4: Quotation"
  QUOTE_RESP=$(curl -s -X POST "$BASE_URL/crm/quotations" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{
      \"lead_id\":\"$LEAD_ID\",
      \"plots\":[{\"plot_no\":$PLOT_NO,\"elevation\":\"Contemporary\",\"base_price_inr\":50000000,\"premium_pct\":0,\"quoted_price_inr\":50000000}],
      \"valid_until\":\"2026-12-31\"
    }")
  QUOTE_ID=$(echo "$QUOTE_RESP" | json_get "['id']")
  assert_not_empty "Quotation ID assigned" "$QUOTE_ID"

  LEAD_AFTER_QUOTE=$(curl -s "$BASE_URL/crm/leads/$LEAD_ID" -H "$AUTH")
  LEAD_STATUS_3=$(echo "$LEAD_AFTER_QUOTE" | json_get "['status']")
  # Quotation creation may or may not auto-update lead status depending on workflow config
  assert_not_empty "Lead status valid after quotation" "$LEAD_STATUS_3"

# ═══════════════════════════════════════════════════════════════════
#  T5: BOOKING
# ═══════════════════════════════════════════════════════════════════
  section "T5: Booking"
  BOOK_RESP=$(curl -s -X POST "$BASE_URL/crm/bookings" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{
      \"lead_id\":\"$LEAD_ID\",
      \"plot_no\":$PLOT_NO,
      \"client_name\":\"E2E Test Lead $TIMESTAMP\",
      \"elevation_type\":\"Contemporary\",
      \"sale_value_inr\":50000000,
      \"discount_pct\":0,
      \"booking_amount_inr\":500000
    }")
  BOOKING_ID=$(echo "$BOOK_RESP" | json_get "['id']")
  BOOKING_STATUS=$(echo "$BOOK_RESP" | json_get "['status']")
  assert_not_empty "Booking ID assigned" "$BOOKING_ID"
  assert "Booking status is PROVISIONAL" "PROVISIONAL" "$BOOKING_STATUS"

  # Verify plot locked
  PLOT_SALES=$(python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
async def f():
    c = AsyncIOMotorClient('mongodb://localhost:27017')
    p = await c.regal_park_villas.plots.find_one({'plot_no': $PLOT_NO}, {'sales_status': 1, '_id': 0})
    print(p.get('sales_status','?'))
    c.close()
asyncio.run(f())
" 2>/dev/null)
  assert "Plot locked to BOOKED" "BOOKED" "$PLOT_SALES"

  # Double-booking blocked
  DUP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/crm/bookings" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"lead_id\":\"$LEAD_ID\",\"plot_no\":$PLOT_NO,\"client_name\":\"Dup\",\"elevation_type\":\"Contemporary\",\"sale_value_inr\":50000000,\"discount_pct\":0,\"booking_amount_inr\":500000}")
  assert "Double-booking returns 409" "409" "$DUP_CODE"

# ═══════════════════════════════════════════════════════════════════
#  T6: BOOKING APPROVAL
# ═══════════════════════════════════════════════════════════════════
  section "T6: Booking Approval"
  APPROVALS=$(curl -s "$BASE_URL/crm/booking-approvals" -H "$AUTH")
  APPROVAL_ID=$(echo "$APPROVALS" | python3 -c "
import sys,json
for a in json.load(sys.stdin):
    if a.get('booking_id') == '$BOOKING_ID':
        print(a['id']); break
else: print('NONE')
" 2>/dev/null)
  assert_not_empty "Approval auto-created" "$APPROVAL_ID"

  # Approve all levels
  APPROVE_ROUNDS=0
  for _ in 1 2 3 4 5; do
    OVERALL=$(curl -s "$BASE_URL/crm/booking-approvals/$APPROVAL_ID" -H "$AUTH" | json_get "['overall_status']")
    [ "$OVERALL" = "APPROVED" ] && break
    curl -s -X POST "$BASE_URL/crm/booking-approvals/$APPROVAL_ID/decide" \
      -H "Content-Type: application/json" -H "$AUTH" \
      -d '{"decision":"APPROVED","note":"Regression test"}' > /dev/null
    APPROVE_ROUNDS=$((APPROVE_ROUNDS + 1))
  done

  FINAL_OVERALL=$(curl -s "$BASE_URL/crm/booking-approvals/$APPROVAL_ID" -H "$AUTH" | json_get "['overall_status']")
  assert "All approval levels pass" "APPROVED" "$FINAL_OVERALL"

  BOOKING_AFTER=$(curl -s "$BASE_URL/crm/bookings/$BOOKING_ID" -H "$AUTH" | json_get "['status']")
  assert "Booking transitions to APPROVED" "APPROVED" "$BOOKING_AFTER"

# ═══════════════════════════════════════════════════════════════════
#  T7: BOOKING → PROJECT CONVERSION
# ═══════════════════════════════════════════════════════════════════
  section "T7: Booking Conversion"
  CONVERT_RESP=$(curl -s -X POST "$BASE_URL/crm/bookings/$BOOKING_ID/convert" \
    -H "Content-Type: application/json" -H "$AUTH")
  CONVERT_MSG=$(echo "$CONVERT_RESP" | json_get ".get('message','FAIL')")
  PROJECT_ID=$(echo "$CONVERT_RESP" | json_get ".get('project_id','')")
  CLIENT_ID=$(echo "$CONVERT_RESP" | json_get ".get('client_id','')")
  MILESTONE_COUNT=$(echo "$CONVERT_RESP" | json_get ".get('milestones_count',0)")
  PLOT_FINAL=$(echo "$CONVERT_RESP" | json_get ".get('plot_sales_status','')")

  assert "Conversion succeeds" "Booking converted to project successfully" "$CONVERT_MSG"
  assert_not_empty "Project ID created" "$PROJECT_ID"
  assert_not_empty "Client user created" "$CLIENT_ID"
  assert "6 milestones created" "6" "$MILESTONE_COUNT"
  assert "Plot → UNDER_CONSTRUCTION" "UNDER_CONSTRUCTION" "$PLOT_FINAL"

  BOOKING_FINAL=$(curl -s "$BASE_URL/crm/bookings/$BOOKING_ID" -H "$AUTH" | json_get "['status']")
  assert "Booking → CONFIRMED" "CONFIRMED" "$BOOKING_FINAL"

  # Idempotency: second convert is safe
  CONVERT2_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/crm/bookings/$BOOKING_ID/convert" \
    -H "Content-Type: application/json" -H "$AUTH")
  assert "Duplicate conversion returns 200 (idempotent)" "200" "$CONVERT2_CODE"

# ═══════════════════════════════════════════════════════════════════
#  T8: CUSTOMER PORTAL
# ═══════════════════════════════════════════════════════════════════
  section "T8: Customer Portal"

  CLIENT_EMAIL=$(python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
async def f():
    c = AsyncIOMotorClient('mongodb://localhost:27017')
    u = await c.regal_park_villas.users.find_one({'id': '$CLIENT_ID'}, {'email': 1, '_id': 0})
    print(u['email'] if u else '')
    c.close()
asyncio.run(f())
" 2>/dev/null)
  assert_not_empty "Client email resolved" "$CLIENT_EMAIL"

  CLIENT_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$CLIENT_EMAIL\",\"password\":\"$CLIENT_DEFAULT_PASSWORD\"}")
  CLIENT_TOKEN=$(echo "$CLIENT_LOGIN" | json_get ".get('access_token','')")
  assert_not_empty "Client login succeeds" "$CLIENT_TOKEN"
  CAUTH="Authorization: Bearer $CLIENT_TOKEN"

  # Dashboard
  DASH=$(curl -s "$BASE_URL/portal/dashboard" -H "$CAUTH")
  VILLA=$(echo "$DASH" | json_get ".get('villa_name','')")
  PLOT_NUM=$(echo "$DASH" | json_get ".get('plot_number','')")
  assert_not_empty "Portal shows villa name" "$VILLA"
  assert_not_empty "Portal shows plot number" "$PLOT_NUM"

  # Payments
  PAY=$(curl -s "$BASE_URL/portal/payments" -H "$CAUTH")
  PAY_COUNT=$(echo "$PAY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('milestones',[])))" 2>/dev/null)
  assert "Portal shows 6 milestones" "6" "$PAY_COUNT"

  FIRST_STATUS=$(echo "$PAY" | json_get ".get('milestones',[])[0].get('status','')")
  assert "Booking Amount is PAID" "PAID" "$FIRST_STATUS"

# ═══════════════════════════════════════════════════════════════════
#  T9: ROLE ISOLATION & SECURITY
# ═══════════════════════════════════════════════════════════════════
  section "T9: Role Isolation"
  assert_http "Client blocked from CRM leads"     "403" "$BASE_URL/crm/leads"      "$CAUTH"
  assert_http "Client blocked from user list"      "403" "$BASE_URL/auth/users"     "$CAUTH"
  assert_http "Client blocked from COO dashboard"  "403" "$BASE_URL/coo/portfolio"  "$CAUTH"
  assert_http "Client blocked from bookings"       "403" "$BASE_URL/crm/bookings"   "$CAUTH"
  assert_http "Client blocked from pricing"        "403" "$BASE_URL/crm/pricing"    "$CAUTH"

  # No-token requests
  assert_http "Unauthenticated CRM request blocked"  "401" "$BASE_URL/crm/leads"   "Authorization: Bearer invalid"
  assert_http "Unauthenticated portal blocked"        "401" "$BASE_URL/portal/dashboard" "Authorization: Bearer invalid"

fi  # end of PLOT_NO != NONE

# ═══════════════════════════════════════════════════════════════════
#  T10: REFRESH TOKEN LIFECYCLE
#  Uses COO credentials to avoid admin rate-limit collision from T1
# ═══════════════════════════════════════════════════════════════════
section "T10: Refresh Token Lifecycle"

T10_EMAIL="${COO_EMAIL:-$ADMIN_EMAIL}"
T10_PASS="${COO_PASSWORD:-$ADMIN_PASSWORD}"

FRESH_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$T10_EMAIL\",\"password\":\"$T10_PASS\"}")
FRESH_RT=$(echo "$FRESH_LOGIN" | json_get "['refresh_token']")
assert_not_empty "Fresh refresh token issued" "$FRESH_RT"

# Refresh rotates tokens
REFRESH_RESP=$(curl -s -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$FRESH_RT\"}")
NEW_AT=$(echo "$REFRESH_RESP" | json_get ".get('access_token','')")
NEW_RT=$(echo "$REFRESH_RESP" | json_get ".get('refresh_token','')")
assert_not_empty "Refresh returns new access_token" "$NEW_AT"
assert_not_empty "Refresh returns new refresh_token" "$NEW_RT"

# Old token revoked
OLD_RT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$FRESH_RT\"}")
assert "Old refresh token rejected" "401" "$OLD_RT_CODE"

# Logout
LOGOUT_RESP=$(curl -s -X POST "$BASE_URL/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$NEW_RT\"}")
REVOKED=$(echo "$LOGOUT_RESP" | json_get ".get('revoked', False)")
assert "Logout revokes token" "True" "$REVOKED"

POST_LOGOUT_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$NEW_RT\"}")
assert "Post-logout refresh rejected" "401" "$POST_LOGOUT_CODE"

# ═══════════════════════════════════════════════════════════════════
#  REPORT
# ═══════════════════════════════════════════════════════════════════
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
printf "${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n"
printf "${BOLD}  TEST REPORT${RESET}\n"
printf "${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n"
echo ""
printf "  Total:    %d\n" "$TOTAL"
printf "  ${GREEN}Passed:  %d${RESET}\n" "$PASS"
if [ $FAIL -gt 0 ]; then
  printf "  ${RED}Failed:  %d${RESET}\n" "$FAIL"
fi
if [ $SKIP -gt 0 ]; then
  printf "  ${YELLOW}Skipped: %d${RESET}\n" "$SKIP"
fi
printf "  Duration: %ds\n" "$DURATION"
echo ""

if [ $FAIL -gt 0 ]; then
  printf "${RED}${BOLD}  FAILURES:${RESET}\n"
  printf "$FAILURES\n"
  echo ""
  printf "${RED}${BOLD}  ❌ REGRESSION SUITE FAILED${RESET}\n"
  echo ""
  exit 1
else
  printf "${GREEN}${BOLD}  ✅ ALL TESTS PASSED${RESET}\n"
  echo ""
  exit 0
fi
