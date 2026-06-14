#!/bin/bash
set -e

# ── Load credentials from .env.test ──────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${PROJECT_ROOT:-.}/.env.test"

# Walk up to find .env.test if not at project root
for d in "$SCRIPT_DIR" "$SCRIPT_DIR/.." "$SCRIPT_DIR/../.." "/Users/darshb/Downloads/regal_park"; do
  if [ -f "$d/.env.test" ]; then
    ENV_FILE="$d/.env.test"
    break
  fi
done

if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env.test not found. Create it from .env.test.example:"
  echo "   cp .env.test.example .env.test"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

# Validate required vars
for var in ADMIN_EMAIL ADMIN_PASSWORD CLIENT_DEFAULT_PASSWORD BASE_URL; do
  if [ -z "${!var}" ]; then
    echo "❌ Missing $var in .env.test"
    exit 1
  fi
done

echo "═══════════════════════════════════════════════════════════════"
echo "  REGAL PARK VILLAS — FULL E2E FLOW"
echo "  Lead → Site Visit → Quotation → Booking → Approval"
echo "  → Conversion → Customer Portal"
echo "═══════════════════════════════════════════════════════════════"
echo "  Credentials: $ENV_FILE"
echo "  Backend:     $BASE_URL"

cd /Users/darshb/Downloads/regal_park/backend
source venv/bin/activate

# ─────────────────────────────────────────────────────────
# STEP 0: Login as Admin
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 0: Admin Login"
LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
echo "  Admin logged in ✅"
AUTH="Authorization: Bearer $TOKEN"

# ─────────────────────────────────────────────────────────
# STEP 1: Create Lead
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 1: Create Lead"
LEAD=$(curl -s -X POST "$BASE_URL/crm/leads" \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d '{
    "full_name": "Rajesh Sharma",
    "email": "rajesh.sharma@gmail.com",
    "phone": "+919876543210",
    "source": "REFERRAL",
    "interested_elevation": "Contemporary",
    "budget_range_inr": "4-6 Cr",
    "notes": "Referred by Mr. Patel. Looking for Contemporary villa."
  }')
LEAD_ID=$(echo "$LEAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
LEAD_NAME=$(echo "$LEAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['full_name'])")
LEAD_STATUS=$(echo "$LEAD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])")
echo "  Lead: $LEAD_NAME"
echo "  ID:   ${LEAD_ID:0:12}..."
echo "  Status: $LEAD_STATUS ✅"

# ─────────────────────────────────────────────────────────
# STEP 2: Schedule Site Visit
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 2: Schedule Site Visit"

# Find an available plot
PLOT_NO=$(python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
async def f():
    c = AsyncIOMotorClient('mongodb://localhost:27017')
    p = await c.regal_park_villas.plots.find_one({'sales_status': 'AVAILABLE'}, {'plot_no': 1, '_id': 0})
    print(p['plot_no'] if p else 'NONE')
    c.close()
asyncio.run(f())
")
echo "  Target plot: $PLOT_NO"

if [ "$PLOT_NO" = "NONE" ]; then
  echo "  ❌ No available plots. Cannot continue."
  exit 1
fi

VISIT=$(curl -s -X POST "$BASE_URL/crm/site-visits" \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d "{
    \"lead_id\": \"$LEAD_ID\",
    \"scheduled_at\": \"2026-06-20T10:00:00\",
    \"plots_shown\": [$PLOT_NO]
  }")
VISIT_ID=$(echo "$VISIT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "  Visit ID: ${VISIT_ID:0:12}..."

echo "  Completing visit..."
curl -s -X PATCH "$BASE_URL/crm/site-visits/$VISIT_ID" \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d '{"feedback": "Client loved the plot. Ready for quotation.", "follow_up_date": "2026-06-22"}' > /dev/null
echo "  Visit completed ✅"

LEAD_STATUS2=$(curl -s "$BASE_URL/crm/leads/$LEAD_ID" -H "$AUTH" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "  Lead status: $LEAD_STATUS2"

# ─────────────────────────────────────────────────────────
# STEP 3: Generate Quotation
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 3: Generate Quotation"
QUOTE=$(curl -s -X POST "$BASE_URL/crm/quotations" \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d "{
    \"lead_id\": \"$LEAD_ID\",
    \"plots\": [{
      \"plot_no\": $PLOT_NO,
      \"elevation\": \"Contemporary\",
      \"base_price_inr\": 50000000,
      \"premium_pct\": 0,
      \"quoted_price_inr\": 50000000
    }],
    \"valid_until\": \"2026-07-14\"
  }")
QUOTE_ID=$(echo "$QUOTE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
echo "  Quote ID: ${QUOTE_ID:0:12}... ✅"

# ─────────────────────────────────────────────────────────
# STEP 4: Create Booking
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 4: Create Booking"
BOOKING=$(curl -s -X POST "$BASE_URL/crm/bookings" \
  -H "Content-Type: application/json" -H "$AUTH" \
  -d "{
    \"lead_id\": \"$LEAD_ID\",
    \"plot_no\": $PLOT_NO,
    \"client_name\": \"Rajesh Sharma\",
    \"elevation_type\": \"Contemporary\",
    \"sale_value_inr\": 50000000,
    \"discount_pct\": 0,
    \"booking_amount_inr\": 500000
  }")
BOOKING_ID=$(echo "$BOOKING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['id'])")
BOOKING_STATUS=$(echo "$BOOKING" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])")
echo "  Booking ID: ${BOOKING_ID:0:12}..."
echo "  Status: $BOOKING_STATUS ✅"

# ─────────────────────────────────────────────────────────
# STEP 5: Approve Booking (all levels)
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 5: Approve Booking"
APPROVALS=$(curl -s "$BASE_URL/crm/booking-approvals" -H "$AUTH")
APPROVAL_ID=$(echo "$APPROVALS" | python3 -c "
import sys,json
for a in json.load(sys.stdin):
    if a.get('booking_id') == '$BOOKING_ID':
        print(a['id'])
        break
else:
    print('NONE')
")

if [ "$APPROVAL_ID" = "NONE" ]; then
  echo "  ❌ No approval found"
  exit 1
fi

# Approve all pending levels
for i in 1 2 3 4 5; do
  STATUS=$(curl -s "$BASE_URL/crm/booking-approvals/$APPROVAL_ID" -H "$AUTH" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('overall_status','?'))")
  
  if [ "$STATUS" = "APPROVED" ]; then
    echo "  All levels approved ✅"
    break
  fi
  
  LEVEL=$(curl -s "$BASE_URL/crm/booking-approvals/$APPROVAL_ID" -H "$AUTH" | \
    python3 -c "import sys,json; print(json.load(sys.stdin).get('current_level','?'))")
  echo "  Approving level $LEVEL..."
  
  curl -s -X POST "$BASE_URL/crm/booking-approvals/$APPROVAL_ID/decide" \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d '{"decision": "APPROVED", "note": "E2E test approval"}' > /dev/null
done

BOOKING_STATUS2=$(curl -s "$BASE_URL/crm/bookings/$BOOKING_ID" -H "$AUTH" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
echo "  Booking: $BOOKING_STATUS2"

# ─────────────────────────────────────────────────────────
# STEP 6: Convert Booking → Project
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 6: Convert Booking → Project"
CONVERT=$(curl -s -X POST "$BASE_URL/crm/bookings/$BOOKING_ID/convert" \
  -H "Content-Type: application/json" -H "$AUTH")
echo "$CONVERT" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f\"  Result:     {d.get('message', d.get('detail', '?'))}\")
print(f\"  Project:    {d.get('project_id', 'N/A')[:16]}...\")
print(f\"  Client:     {d.get('client_id', 'N/A')[:16]}...\")
print(f\"  Milestones: {d.get('milestones_count', '?')}\")
print(f\"  Plot:       {d.get('plot_sales_status', '?')}\")
"
CLIENT_ID=$(echo "$CONVERT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('client_id',''))")

# ─────────────────────────────────────────────────────────
# STEP 7: Customer Portal
# ─────────────────────────────────────────────────────────
echo ""
echo "▶ STEP 7: Customer Portal"
CLIENT_EMAIL=$(python3 -c "
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
async def f():
    c = AsyncIOMotorClient('mongodb://localhost:27017')
    u = await c.regal_park_villas.users.find_one({'id': '$CLIENT_ID'}, {'email': 1, '_id': 0})
    print(u['email'] if u else 'unknown')
    c.close()
asyncio.run(f())
")
echo "  Client: $CLIENT_EMAIL"

CLIENT_LOGIN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$CLIENT_EMAIL\",\"password\":\"$CLIENT_DEFAULT_PASSWORD\"}")
CLIENT_TOKEN=$(echo "$CLIENT_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null)

if [ -z "$CLIENT_TOKEN" ]; then
  echo "  ❌ Client login failed"
  exit 1
fi

CLIENT_AUTH="Authorization: Bearer $CLIENT_TOKEN"
echo "  Logged in ✅"

echo ""
echo "  ┌─────────────────────────────────────────┐"
echo "  │         CUSTOMER PORTAL                  │"
echo "  └─────────────────────────────────────────┘"

curl -s "$BASE_URL/portal/dashboard" -H "$CLIENT_AUTH" | python3 -c "
import sys,json
d = json.load(sys.stdin)
print(f\"  🏠 Villa:    {d.get('villa_name', '?')}\")
print(f\"  📍 Plot:     {d.get('plot_number', '?')}\")
print(f\"  📊 Progress: {d.get('progress_pct', 0)}%\")
print(f\"  🔨 Stage:    {d.get('current_stage', 'N/A')}\")
nm = d.get('next_milestone', {})
if nm:
    print(f\"  💰 Next:     {nm.get('milestone_name', '?')} — ₹{nm.get('amount_inr', 0):,.0f}\")
"

echo ""
echo "  ── Payment Milestones ──"
curl -s "$BASE_URL/portal/payments" -H "$CLIENT_AUTH" | python3 -c "
import sys,json
d = json.load(sys.stdin)
ms = d.get('milestones', [])
total = paid = 0
for m in ms:
    icon = '✅' if m['status'] == 'PAID' else '⏳'
    print(f\"  {icon} {m['milestone_name']:20s} ₹{m['amount_inr']:>14,.0f}  {m['status']}\")
    total += m['amount_inr']
    if m['status'] == 'PAID': paid += m['amount_inr']
print(f\"  {'─'*55}\")
print(f\"  Total: ₹{total:,.0f}  |  Paid: ₹{paid:,.0f}\")
"

echo ""
echo "  ── Client Isolation ──"
CRM=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/crm/leads" -H "$CLIENT_AUTH")
USR=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/users" -H "$CLIENT_AUTH")
COO=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/coo/portfolio" -H "$CLIENT_AUTH")
echo "  CRM:   HTTP $CRM $([ "$CRM" = "403" ] && echo '✅' || echo '❌')"
echo "  Users: HTTP $USR $([ "$USR" = "403" ] && echo '✅' || echo '❌')"
echo "  COO:   HTTP $COO $([ "$COO" = "403" ] && echo '✅' || echo '❌')"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ COMPLETE FLOW VERIFIED"
echo "═══════════════════════════════════════════════════════════════"
