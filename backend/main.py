"""
STRATAGENT — FastAPI Backend
Strategic Sales International ApS
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from routers import knowledge_base, field_intelligence, active_watch, output_engine
from services.demo_gate import verify_password, create_session_id

app = FastAPI(
    title="STRATAGENT",
    description="The Intelligence Behind Agentic Sales",
    version="1.0.0",
    docs_url=None,   # Hide Swagger in production
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Tighten post-XPRIZE
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(knowledge_base.router, prefix="/api/knowledge-base", tags=["Knowledge Base"])
app.include_router(field_intelligence.router, prefix="/api/field-intelligence", tags=["Field Intelligence"])
app.include_router(active_watch.router, prefix="/api/active-watch", tags=["Active Watch"])
app.include_router(output_engine.router, prefix="/api/output", tags=["Output Engine"])


class AuthRequest(BaseModel):
    password: str


@app.post("/api/auth")
async def authenticate(req: AuthRequest):
    """Demo gate — validate password and return session token."""
    if not verify_password(req.password):
        raise HTTPException(status_code=401, detail="Invalid password")
    session_id = create_session_id(req.password)
    return {
        "session_id": session_id,
        "actions_remaining": 5,
        "message": "Welcome to STRATAGENT.",
    }


@app.get("/health")
async def health():
    return {"status": "operational", "service": "STRATAGENT"}
