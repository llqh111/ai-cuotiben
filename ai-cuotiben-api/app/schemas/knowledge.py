from typing import Optional
from pydantic import BaseModel


class InitVaultRequest(BaseModel):
    overwrite: bool = False


class SyncStatus(BaseModel):
    vault_configured: bool = False
    vault_path: Optional[str] = None
    questions_total: int = 0
    questions_synced: int = 0
    knowledge_points_total: int = 0
    knowledge_points_synced: int = 0
    last_sync: Optional[str] = None
    pending: int = 0
