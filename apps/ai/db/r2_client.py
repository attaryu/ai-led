"""Cloudflare R2 (S3-compatible) read access — same bucket/credentials as
apps/backend's StorageService, but this side only ever reads (downloads a
BuktiDukung file for the ingestion worker). Uploads/presigned URLs stay
backend's job.
"""

from __future__ import annotations

import os
import threading
from pathlib import Path

_client = None
_client_lock = threading.Lock()


def _get_client():
    global _client
    if _client is None:
        with _client_lock:
            if _client is None:
                import boto3

                account_id = os.environ["R2_ACCOUNT_ID"]
                _client = boto3.client(
                    "s3",
                    endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
                    aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
                    aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                    region_name="auto",
                )
    return _client


def download_to(key: str, dest_path: Path) -> Path:
    """Download an R2 object to dest_path, return it. Caller owns cleanup."""
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    bucket = os.environ["R2_BUCKET_NAME"]
    _get_client().download_file(bucket, key, str(dest_path))
    return dest_path
