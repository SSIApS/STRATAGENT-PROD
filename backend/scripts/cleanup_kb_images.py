"""
cleanup_kb_images.py
Run from: stratagent/backend/

Lists all images in product_images collection for a given supplier_id,
and deletes the ones you confirm.

Usage:
    python scripts/cleanup_kb_images.py --supplier stratativ3d --dry-run
    python scripts/cleanup_kb_images.py --supplier stratativ3d --delete
"""
import sys
import argparse
sys.path.insert(0, ".")

from services import firestore as db


def list_images_for_supplier(supplier_id: str) -> list:
    docs = (
        db.db.collection("product_images")
        .where("supplier_id", "==", supplier_id)
        .stream()
    )
    return [{"id": d.id, **d.to_dict()} for d in docs]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--supplier", required=True, help="supplier_id to clean up")
    parser.add_argument("--dry-run", action="store_true", help="List only, do not delete")
    parser.add_argument("--delete", action="store_true", help="Actually delete")
    args = parser.parse_args()

    images = list_images_for_supplier(args.supplier)
    if not images:
        print(f"No images found for supplier_id='{args.supplier}'")
        return

    print(f"\nFound {len(images)} image(s) for supplier_id='{args.supplier}':\n")
    for img in images:
        print(f"  id={img['id']}")
        print(f"    label   : {img.get('label', '—')}")
        print(f"    filename: {img.get('filename', '—')}")
        print(f"    tags    : {img.get('tags', '—')}")
        print()

    if args.dry_run:
        print("Dry run -- nothing deleted. Re-run with --delete to remove.")
        return

    if args.delete:
        confirm = input(f"Delete all {len(images)} image(s)? [yes/no]: ").strip().lower()
        if confirm != "yes":
            print("Aborted.")
            return
        for img in images:
            db.db.collection("product_images").document(img["id"]).delete()
            print(f"  Deleted: {img['id']} ({img.get('label', img.get('filename', ''))})")
        print(f"\nDone. {len(images)} image(s) removed.")
    else:
        print("No action taken. Use --dry-run to preview or --delete to remove.")


if __name__ == "__main__":
    main()
