# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenDeepWiki is an AI-driven code knowledge base system built on .NET 9 and Microsoft Semantic Kernel. It analyzes code repositories (GitHub, GitLab, Gitee, Gitea) and generates comprehensive documentation, knowledge graphs, and AI-powered chat interfaces. The project consists of three main components:

1. **Backend API** (.NET 9) - Core analysis and document generation engine
2. **Frontend** (React + TypeScript + Vite) - Web interface using Radix UI components
3. **Mem0 Service** (Python FastAPI) - Vector database RAG support with Neo4j integration

## Build & Run Commands

### Using Makefile (Recommended)

```bash
# Build all services (frontend + Docker images)
make build

# Start all services in background
make up

# Start in development mode with visible logs
make dev

# Stop all services
make down

# View logs
make logs

# Clean all Docker resources (caution: removes volumes)
make clean
```

### Frontend Development

```bash
cd web-site
npm install
npm run dev           # Development server
npm run build         # Production build
npm run lint          # Run ESLint
npm run preview       # Preview production build
```

### Backend Development (Docker)

```bash
# Build specific architecture
make build-arm        # ARM64
make build-amd        # AMD64

# Build only backend
make build-backend
docker-compose build koalawiki

# Start only backend
make dev-backend
```

### Mem0 Service (Vector Database RAG)

```bash
# Start mem0 services (includes Neo4j, PostgreSQL, mem0 server)
make dev-mem0         # Development mode
make up-mem0          # Background mode
make down-mem0        # Stop mem0 services
```

### Without Make (Windows/Direct Docker)

```bash
docker-compose build
docker-compose up -d
docker-compose logs -f
docker-compose down
```

## Architecture

### Backend Architecture (.NET 9)

**Core Components:**

- **KoalaWiki** (src/KoalaWiki/) - Main API application using FastService framework
  - Uses Microsoft Semantic Kernel for AI orchestration
  - Supports OpenAI, Azure OpenAI, and Anthropic providers
  - Implements MCP (Model Context Protocol) server at `/api/mcp` and `/api/mcp/sse`

- **KoalaWiki.Domains** - Domain entities and models
  - Document, Warehouse, User, Statistics, FineTuning entities
  - Defines core business objects

- **KoalaWiki.Core** - Core business logic and utilities

- **Provider Layer** - Database abstraction supporting:
  - SQLite (default)
  - PostgreSQL
  - SQL Server
  - MySQL

**Key Service Classes (src/KoalaWiki/Services/):**

- `WarehouseService` - Repository analysis and document generation orchestration
- `DocumentCatalogService` - Directory structure and documentation catalog management
- `AuthService` - Authentication and JWT token management
- `RepositoryService` - Git repository cloning and management
- `FineTuningService` - Generate fine-tuning datasets from repositories
- `StatisticsService` - Usage analytics and statistics
- `FfeishuBotService` - Feishu (Lark) bot integration

**KoalaWarehouse Pipeline (src/KoalaWiki/KoalaWarehouse/):**

The core analysis pipeline processes repositories through these stages:

1. **DocumentsService** - Orchestrates the entire document generation workflow
2. **GenerateThinkCatalogue** - AI generates task breakdown and directory structure
3. **DocumentPending** - Processes pending documentation tasks
4. **MiniMapService** - Generates mind maps from repository structure
5. **Pipeline/** - Processing stages for repository analysis

**Key Directories:**

- `BackendService/` - Background workers (MiniMapBackgroundService, etc.)
- `Extensions/` - Extension methods and service registration
- `Mem0/` - Mem0 RAG integration (memory-enhanced chat)
- `plugins/CodeAnalysis/` - Semantic Kernel plugins for code analysis prompts
- `Prompts/` - AI prompt templates organized by function

### Frontend Architecture (React + TypeScript)

**Technology Stack:**

- React 19 with TypeScript
- Vite for build tooling
- Radix UI for component primitives
- TailwindCSS 4 for styling
- React Router for navigation
- Zustand for state management
- i18next for internationalization

**Design System:**

- Follows flat design principles (no gradients, shadows, or 3D effects)
- Uses Ant Design patterns for UI components
- Limited color palettes (2-3 colors max) with high contrast
- Token-based theming for consistency
- Responsive grid system with proper breakpoints

**Code Conventions (from .cursor/rules):**

- Use functional components with hooks (not class components)
- PascalCase for components, camelCase for variables/functions
- Organize by features/routes, not file types
- Strict TypeScript: explicit interfaces, avoid `any`
- React.memo for pure components, useMemo/useCallback for optimization
- Lazy loading for routes and large components

### Mem0 Service (Python)

Located in `server/` directory:

- FastAPI server providing vector database RAG capabilities
- Integrates with Neo4j graph database for knowledge relationships
- Uses PostgreSQL for vector storage
- Dependencies: mem0ai, langchain_neo4j, rank_bm25

## Environment Configuration

Key environment variables (set in `docker-compose.yml` or `docker-compose-mem0.yml`):

### AI Model Configuration

- `CHAT_MODEL` - Chat model (must support function calling)
- `ANALYSIS_MODEL` - Analysis model for directory structure generation (if empty, uses CHAT_MODEL)
- `CHAT_API_KEY` - Your API key
- `ENDPOINT` - API endpoint URL
- `MODEL_PROVIDER` - Model provider: OpenAI, AzureOpenAI, Anthropic
- `LANGUAGE` - Generation language (e.g., "中文", "English")
- `DEEP_RESEARCH_MODEL` - Deep research model (defaults to CHAT_MODEL if empty)

### Feature Flags

- `ENABLE_INCREMENTAL_UPDATE=true` - Enable incremental repository updates
- `ENABLE_CODED_DEPENDENCY_ANALYSIS=false` - Enable code dependency analysis
- `ENABLE_WAREHOUSE_FUNCTION_PROMPT_TASK=true` - Enable MCP prompt generation
- `ENABLE_WAREHOUSE_DESCRIPTION_TASK=true` - Enable repository description generation
- `ENABLE_CODE_COMPRESSION=false` - Enable code compression to reduce tokens
- `EnableSmartFilter=true` - Enable smart directory filtering

### Repository Processing

- `KOALAWIKI_REPOSITORIES=/repositories` - Repository storage path
- `TASK_MAX_SIZE_PER_USER=5` - Max parallel document generation tasks per user
- `UPDATE_INTERVAL=5` - Repository update interval (days)
- `MAX_FILE_LIMIT=100` - Max upload file size (MB)
- `CATALOGUE_FORMAT=compact` - Directory format: compact, json, pathlist, unix
- `READ_MAX_TOKENS=100000` - Max tokens for reading files (set to 70% of model's context window)
- `MAX_FILE_READ_COUNT=10` - Max files AI can read (0 = unlimited)

### Database

- `DB_TYPE` - Database type: sqlite, postgres, sqlserver, mysql
- `DB_CONNECTION_STRING` - Database connection string

### Feishu Bot (Optional)

- `FeishuAppId` - Feishu App ID
- `FeishuAppSecret` - Feishu App Secret
- `FeishuBotName` - Bot display name

## Repository Analysis Workflow

When a repository is added, OpenDeepWiki executes this pipeline:

1. Clone repository locally
2. Read `.gitignore` and filter files
3. Recursively scan directories
4. If file count exceeds threshold → call AI for intelligent filtering
5. Generate/update README.md
6. Call AI for repository classification and project overview
7. Generate thinking directory (task breakdown)
8. Recursively process directory tasks → generate DocumentCatalog
9. Save catalog structure to database
10. Process incomplete documentation tasks
11. If Git repo → clean old commits, generate update log via AI

## MCP (Model Context Protocol) Support

OpenDeepWiki can serve as an MCP server for AI assistants:

```json
{
  "mcpServers": {
    "OpenDeepWiki": {
      "url": "http://your-server:port/api/mcp?owner=AIDotNet&name=OpenDeepWiki"
    }
  }
}
```

For non-streamable HTTP MCP clients, use the SSE endpoint:

```json
{
  "mcpServers": {
    "OpenDeepWiki": {
      "url": "http://your-server:port/api/mcp/sse?owner=AIDotNet&name=OpenDeepWiki"
    }
  }
}
```

## Testing & Deployment

### Development Testing

- Backend: Port 8080 (configurable in docker-compose.yml)
- Frontend: Served via backend at http://localhost:8080
- Aspire Dashboard: Port 18888 for telemetry/observability

### Production Deployment

**Architecture-Specific Builds:**

```bash
docker-compose build --build-arg ARCH=arm64
docker-compose build --build-arg ARCH=amd64
```

**One-Click Sealos Deployment:**

The project supports one-click deployment to Sealos cloud platform. See `scripts/sealos/README.zh-CN.md` for details.

**Migration Scripts:**

- `migrate_docker.sh` - Docker migration helper
- `server/patch_mem0.sh` - Mem0 service patches

## Important Notes

- The .NET backend uses Central Package Management (see `Directory.Packages.props`)
- The solution includes .NET Aspire support (AppHost project) for orchestration
- Frontend build artifacts must be copied to backend's `wwwroot/` directory (handled by Makefile)
- When modifying Semantic Kernel prompts, update files in `src/KoalaWiki/Prompts/` and `src/KoalaWiki/plugins/CodeAnalysis/`
- The system uses LibGit2Sharp for Git operations, Octokit for GitHub API
- Code compression and catalog format settings significantly impact token usage
