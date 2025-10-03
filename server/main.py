import logging
import math
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

from mem0 import Memory

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

# Load environment variables
load_dotenv()

# 获取API_KEY环境变量
API_KEY = os.environ.get("API_KEY")

POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "postgres")
POSTGRES_USER = os.environ.get("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "postgres")
POSTGRES_COLLECTION_NAME = os.environ.get("POSTGRES_COLLECTION_NAME", "memories")

NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://neo4j:7687")
NEO4J_USERNAME = os.environ.get("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "mem0graph")

MEMGRAPH_URI = os.environ.get("MEMGRAPH_URI", "bolt://localhost:7687")
MEMGRAPH_USERNAME = os.environ.get("MEMGRAPH_USERNAME", "memgraph")
MEMGRAPH_PASSWORD = os.environ.get("MEMGRAPH_PASSWORD", "mem0graph")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL")  # LLM base URL
HISTORY_DB_PATH = os.environ.get("HISTORY_DB_PATH", "/app/history/history.db")

# 支持分离的 Embedder 配置
EMBEDDER_API_KEY = os.environ.get("EMBEDDER_API_KEY", OPENAI_API_KEY)
EMBEDDER_BASE_URL = os.environ.get("EMBEDDER_BASE_URL", OPENAI_BASE_URL)

OPENAI_CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o")
OPENAI_EMBEDDING_MODEL = os.environ.get("OPENAI_EMBEDDING_MODEL", "nvidia_embed")
# nvidia/NV-Embed-v2 的维度是 4096，只用于 pgvector 配置，不传递给 embedder
EMBEDDING_MODEL_DIMS = 4096

# 是否启用 Graph Store
GRAPH_STORE_ENABLED = os.environ.get("GRAPH_STORE_ENABLED", "true").lower() == "true"

# 构建 LLM 配置
# 注意：mem0 的 OpenAIConfig 不支持 base_url 参数
# 需要通过环境变量让 OpenAI SDK 自动读取
llm_config = {
    "api_key": OPENAI_API_KEY,
    "temperature": 0.2,
    "model": OPENAI_CHAT_MODEL
}

# 构建 Embedder 配置
embedder_config = {
    "api_key": EMBEDDER_API_KEY,
    "model": OPENAI_EMBEDDING_MODEL
}

# 构建默认配置
DEFAULT_CONFIG = {
    "version": "v1.1",
    "vector_store": {
        "provider": "pgvector",
        "config": {
            "host": POSTGRES_HOST,
            "port": int(POSTGRES_PORT),
            "dbname": POSTGRES_DB,
            "user": POSTGRES_USER,
            "password": POSTGRES_PASSWORD,
            "collection_name": POSTGRES_COLLECTION_NAME,
            "embedding_model_dims": EMBEDDING_MODEL_DIMS,
            "hnsw": False,  # 禁用 HNSW 索引（不支持 > 2000 维）
            "diskann": False,  # 禁用 DiskANN 索引
        },
    },
    "llm": {"provider": "openai", "config": llm_config},
    "embedder": {"provider": "openai", "config": embedder_config},
    "history_db_path": HISTORY_DB_PATH,
}

# 根据环境变量决定是否启用 Graph Store
if GRAPH_STORE_ENABLED:
    DEFAULT_CONFIG["graph_store"] = {
        "provider": "neo4j",
        "config": {"url": NEO4J_URI, "username": NEO4J_USERNAME, "password": NEO4J_PASSWORD},
    }
    logging.info("Graph Store enabled")
else:
    logging.info("Graph Store disabled")


MEMORY_INSTANCE = Memory.from_config(DEFAULT_CONFIG)

app = FastAPI(
    title="Mem0 REST APIs",
    description="A REST API for managing and searching memories for your AI Agents and Apps.",
    version="1.0.0",
)

# 安全相关
security = HTTPBearer(auto_error=False)
def verify_api_key(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[str]:
    """验证API Key - 如果设置了API_KEY环境变量则需要认证，支持Bearer和Token两种格式"""
    if not API_KEY:
        return None
    
    # 从Authorization头获取token
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Authorization header required")
    
    # 支持两种格式: "Bearer token" 和 "Token token"
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]  # 去掉 "Bearer " 前缀
    elif auth_header.startswith("Token "):
        token = auth_header[6:]  # 去掉 "Token " 前缀
    else:
        raise HTTPException(status_code=401, detail="Invalid authorization format. Use 'Bearer token' or 'Token token'")
    
    if token != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")
    
    return token


class Message(BaseModel):
    role: str = Field(..., description="Role of the message (user or assistant).")
    content: str = Field(..., description="Message content.")


class MemoryCreate(BaseModel):
    messages: List[Message] = Field(..., description="List of messages to store.")
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    run_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    memory_type: Optional[str] = None
    prompt: Optional[str] = None


class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query.")
    user_id: Optional[str] = None
    run_id: Optional[str] = None
    agent_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    threshold: Optional[float] = None
    limit: int = 50


def clean_nan_values(obj):
    """递归清理对象中的NaN值和无穷大值，将其替换为None"""
    if isinstance(obj, dict):
        return {k: clean_nan_values(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_nan_values(item) for item in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        else:
            return obj
    else:
        return obj


@app.post("/memories/", summary="Create memories")
def add_memory(request: Request, memory_create: MemoryCreate, auth: str = Depends(verify_api_key)):
    """Store new memories."""
    if not any([memory_create.user_id, memory_create.agent_id, memory_create.run_id]):
        raise HTTPException(status_code=400, detail="At least one identifier (user_id, agent_id, run_id) is required.")

    params = {k: v for k, v in memory_create.model_dump().items() if v is not None and k != "messages"}
    try:
        response = MEMORY_INSTANCE.add(messages=[m.model_dump() for m in memory_create.messages], **params)
        cleaned_response = clean_nan_values(response)
        return JSONResponse(content=cleaned_response)
    except Exception as e:
        logging.exception("Error in add_memory:")  # This will log the full traceback
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/", summary="Get memories")
def get_all_memories(
    request: Request,
    user_id: Optional[str] = None,
    run_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    auth: str = Depends(verify_api_key),
):
    """Retrieve stored memories."""
    if not any([user_id, run_id, agent_id]):
        raise HTTPException(status_code=400, detail="At least one identifier is required.")
    try:
        params = {
            k: v for k, v in {"user_id": user_id, "run_id": run_id, "agent_id": agent_id}.items() if v is not None
        }
        return MEMORY_INSTANCE.get_all(**params)
    except Exception as e:
        logging.exception("Error in get_all_memories:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/{memory_id}", summary="Get a memory")
def get_memory(request: Request, memory_id: str, auth: str = Depends(verify_api_key)):
    """Retrieve a specific memory by ID."""
    try:
        result = MEMORY_INSTANCE.get(memory_id)
        cleaned_result = clean_nan_values(result)
        return cleaned_result
    except Exception as e:
        logging.exception("Error in get_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", summary="Search memories")
def search_memories(request: Request, search_req: SearchRequest, auth: str = Depends(verify_api_key)):
    """Search for memories based on a query."""
    try:
        
        print("threshold：",search_req.threshold);
        print("limit：",search_req.limit);

        params = {k: v for k, v in search_req.model_dump().items() if v is not None and k != "query"}
        value = MEMORY_INSTANCE.search(query=search_req.query, **params)
        # 清理结果中的NaN值
        cleaned_value = clean_nan_values(value)
        return cleaned_value
    except Exception as e:
        logging.exception("Error in search_memories:")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/memories/{memory_id}", summary="Update a memory")
def update_memory(request: Request, memory_id: str, updated_memory: Dict[str, Any], auth: str = Depends(verify_api_key)):
    """Update an existing memory."""
    try:
        result = MEMORY_INSTANCE.update(memory_id=memory_id, data=updated_memory)
        cleaned_result = clean_nan_values(result)
        return cleaned_result
    except Exception as e:
        logging.exception("Error in update_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/{memory_id}/history/", summary="Get memory history")
def memory_history(request: Request, memory_id: str, auth: str = Depends(verify_api_key)):
    """Retrieve memory history."""
    try:
        result = MEMORY_INSTANCE.history(memory_id=memory_id)
        cleaned_result = clean_nan_values(result)
        return cleaned_result
    except Exception as e:
        logging.exception("Error in memory_history:")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memories/{memory_id}", summary="Delete a memory")
def delete_memory(request: Request, memory_id: str, auth: str = Depends(verify_api_key)):
    """Delete a specific memory by ID."""
    try:
        MEMORY_INSTANCE.delete(memory_id=memory_id)
        return {"message": "Memory deleted successfully"}
    except Exception as e:
        logging.exception("Error in delete_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/memories/", summary="Delete all memories")
def delete_all_memories(
    request: Request,
    user_id: Optional[str] = None,
    run_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    auth: str = Depends(verify_api_key),
):
    """Delete all memories for a given identifier."""
    if not any([user_id, run_id, agent_id]):
        raise HTTPException(status_code=400, detail="At least one identifier is required.")
    try:
        params = {
            k: v for k, v in {"user_id": user_id, "run_id": run_id, "agent_id": agent_id}.items() if v is not None
        }
        MEMORY_INSTANCE.delete_all(**params)
        return {"message": "All relevant memories deleted"}
    except Exception as e:
        logging.exception("Error in delete_all_memories:")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reset/", summary="Reset all memories")
def reset_memory(request: Request, auth: str = Depends(verify_api_key)):
    """Completely reset stored memories."""
    try:
        MEMORY_INSTANCE.reset()
        return {"message": "All memories reset"}
    except Exception as e:
        logging.exception("Error in reset_memory:")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/", summary="Redirect to the OpenAPI documentation", include_in_schema=False)
def home():
    """Redirect to the OpenAPI documentation."""
    return RedirectResponse(url="/docs")
