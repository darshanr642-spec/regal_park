#!/usr/bin/env python3
"""
Migrate Regal Park Villas data from local MongoDB to MongoDB Atlas.

Usage:
  python migrate_to_atlas.py --source mongodb://localhost:27017 --target "mongodb+srv://user:pass@cluster.mongodb.net"

This script:
  1. Exports all collections from the local database
  2. Resets user passwords to known defaults
  3. Imports everything to the Atlas cluster
  4. Verifies the migration
"""
import argparse
import asyncio
import sys
from datetime import datetime, timezone

# Add backend to path for auth_utils
sys.path.insert(0, "../backend")

from motor.motor_asyncio import AsyncIOMotorClient


DB_NAME = "regal_park_villas"

# Collections to migrate (order matters — referenced collections first)
COLLECTIONS = [
    "users",
    "projects",
    "plots",
    "stages",
    "boq",
    "procurement",
    "team_members",
    "checklists",
    "daily_reports",
    "snags",
    "rfi",
    "leads",
    "quotations",
    "bookings",
    "site_visits",
    "payment_milestones",
    "role_permissions",
    "admin_audit_log",
    "landowner_config",
    "settings",
]

# Known passwords to reset (ensure login works after migration)
SEED_PASSWORDS = {
    "admin@regalpark.com": "Admin@123",
    "coo@regalpark.com": "Coo@123",
    "director@regalpark.com": "Director@123",
    "salesmgr@regalpark.com": "SalesMgr@123",
    "manager@regalpark.com": "Manager@123",
    "architect@regalpark.com": "Architect@123",
    "siteengineer@regalpark.com": "Site@123",
    "mep@regalpark.com": "Mep@123",
    "interior@regalpark.com": "Interior@123",
    "procurement@regalpark.com": "Procure@123",
    "qs@regalpark.com": "Qs@123",
    "safety@regalpark.com": "Safety@123",
    "client@regalpark.com": "Client@123",
    "landowner@regalpark.com": "Landowner@123",
}


async def migrate(source_url: str, target_url: str, dry_run: bool = False):
    print("=" * 60)
    print("  REGAL PARK VILLAS — DATA MIGRATION")
    print("=" * 60)
    print(f"  Source: {source_url[:40]}...")
    print(f"  Target: {target_url[:40]}...")
    print(f"  DB:     {DB_NAME}")
    print(f"  Mode:   {'DRY RUN' if dry_run else 'LIVE'}")
    print("=" * 60)

    # Connect
    src_client = AsyncIOMotorClient(source_url)
    src_db = src_client[DB_NAME]

    tgt_client = AsyncIOMotorClient(target_url)
    tgt_db = tgt_client[DB_NAME]

    # Test connections
    try:
        await src_client.admin.command("ping")
        print("✅ Source connected")
    except Exception as e:
        print(f"❌ Source connection failed: {e}")
        return

    try:
        await tgt_client.admin.command("ping")
        print("✅ Target connected")
    except Exception as e:
        print(f"❌ Target connection failed: {e}")
        return

    # Hash passwords
    try:
        from auth_utils import hash_pw
        pw_hashes = {email: hash_pw(pw) for email, pw in SEED_PASSWORDS.items()}
        print(f"✅ Password hashes generated for {len(pw_hashes)} users")
    except ImportError:
        print("⚠️  auth_utils not found — passwords won't be reset")
        pw_hashes = {}

    total_docs = 0

    for coll_name in COLLECTIONS:
        src_coll = src_db[coll_name]
        tgt_coll = tgt_db[coll_name]

        docs = await src_coll.find({}).to_list(length=None)
        count = len(docs)

        if count == 0:
            print(f"  ⏭  {coll_name:30s}  0 documents (skipped)")
            continue

        # Reset passwords for users collection
        if coll_name == "users" and pw_hashes:
            for doc in docs:
                email = doc.get("email", "")
                if email in pw_hashes:
                    doc["hashed_password"] = pw_hashes[email]

        if not dry_run:
            # Drop target collection first (clean import)
            await tgt_coll.drop()
            # Insert all documents
            await tgt_coll.insert_many(docs)

        total_docs += count
        status = "would migrate" if dry_run else "migrated"
        print(f"  ✅ {coll_name:30s}  {count:5d} documents {status}")

    # Migrate GridFS files (images, etc.)
    print("\n  Checking GridFS files...")
    fs_files = await src_db["fs.files"].find({}).to_list(length=None)
    fs_chunks = await src_db["fs.chunks"].find({}).to_list(length=None)

    if fs_files:
        if not dry_run:
            await tgt_db["fs.files"].drop()
            await tgt_db["fs.chunks"].drop()
            if fs_files:
                await tgt_db["fs.files"].insert_many(fs_files)
            if fs_chunks:
                await tgt_db["fs.chunks"].insert_many(fs_chunks)
        print(f"  ✅ GridFS: {len(fs_files)} files, {len(fs_chunks)} chunks")
        total_docs += len(fs_files) + len(fs_chunks)
    else:
        print("  ⏭  GridFS: no files")

    print(f"\n{'=' * 60}")
    print(f"  TOTAL: {total_docs} documents {'would be ' if dry_run else ''}migrated")
    print(f"{'=' * 60}")

    # Verification
    if not dry_run:
        print("\n  VERIFICATION:")
        for coll_name in COLLECTIONS:
            src_count = await src_db[coll_name].count_documents({})
            tgt_count = await tgt_db[coll_name].count_documents({})
            match = "✅" if src_count == tgt_count else "❌ MISMATCH"
            print(f"    {coll_name:30s}  src={src_count:5d}  tgt={tgt_count:5d}  {match}")

        # Test login
        user = await tgt_db.users.find_one({"email": "admin@regalpark.com"})
        if user:
            print(f"\n  ✅ Admin user found in target: {user.get('name', 'N/A')}")
        else:
            print("\n  ❌ Admin user NOT found in target!")

    src_client.close()
    tgt_client.close()
    print("\n  Done! 🎉\n")


def main():
    parser = argparse.ArgumentParser(description="Migrate Regal Park data to MongoDB Atlas")
    parser.add_argument("--source", default="mongodb://localhost:27017",
                        help="Source MongoDB URL (default: localhost)")
    parser.add_argument("--target", required=True,
                        help="Target MongoDB Atlas URL (mongodb+srv://...)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be migrated without actually doing it")
    args = parser.parse_args()

    asyncio.run(migrate(args.source, args.target, args.dry_run))


if __name__ == "__main__":
    main()
