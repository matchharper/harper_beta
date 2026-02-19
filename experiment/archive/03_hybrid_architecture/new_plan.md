# 🎯 Project Handoff Document: Candidate Search System

**Document Version:** 1.0  
**Last Updated:** 2024  
**Project Status:** Initial Architecture & Implementation Complete  
**Deployment Platform:** Railway  

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Database Schema & Migration Strategy](#database-schema--migration-strategy)
5. [Codebase Structure](#codebase-structure)
6. [Key Implementation Details](#key-implementation-details)
7. [Deployment Configuration](#deployment-configuration)
8. [API Endpoints](#api-endpoints)
9. [Development Workflow](#development-workflow)
10. [Testing Strategy](#testing-strategy)
11. [Monitoring & Observability](#monitoring--observability)
12. [Known Issues & Future Improvements](#known-issues--future-improvements)
13. [Troubleshooting Guide](#troubleshooting-guide)

---

## 1. Project Overview

### 1.1 Business Problem
Build a system to search and match candidates from career data collected from LinkedIn and Google Scholar based on natural language queries. The system must handle:
- Abbreviations (ML → Machine Learning, NLP → Natural Language Processing)
- Synonyms and semantic understanding
- Complex multi-criteria searches

### 1.2 Core Requirements
- ✅ **Simple Architecture:** Fast to build and maintain
- ✅ **Fast Response:** < 1 second query response time
- ✅ **Natural Language:** Accept queries in plain English
- ✅ **Semantic Search:** Understand intent, not just keywords
- ✅ **Scalable:** Handle growing candidate database

### 1.3 Key Design Decisions

| Decision | Rationale | Trade-offs |
|----------|-----------|------------|
| PostgreSQL + pgvector | Single database for structured + vector data | Slower than specialized vector DBs at 10M+ scale |
| OpenAI API | No model hosting, fast development | Ongoing API costs, external dependency |
| FastAPI | Modern, async, auto-docs | Python (slower than compiled languages) |
| Railway | Managed infrastructure, easy deployment | Less control than self-hosted |
| Hybrid Search | Combines semantic + keyword matching | More complex than single approach |

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│                  (Web/Mobile/API Clients)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
│                   FastAPI Application                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Routing    │  │ Validation   │  │   CORS       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   LLM       │  │   Search    │  │  Database   │
│   Parser    │  │   Engine    │  │  Manager    │
│             │  │             │  │             │
│ - Query     │  │ - Vector    │  │ - CRUD      │
│   parsing   │  │   search    │  │ - Pooling   │
│ - Expansion │  │ - Keyword   │  │ - Migrations│
│             │  │   search    │  │             │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       ▼                ▼                ▼
┌─────────────────────────────────────────────────┐
│              External Services                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ OpenAI   │  │  Redis   │  │PostgreSQL│     │
│  │   API    │  │  Cache   │  │+pgvector │     │
│  └──────────┘  └──────────┘  └──────────┘     │
└─────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
User Query: "Find ML engineers with 5+ years experience"
    │
    ▼
[1] LLM Query Parser (OpenAI GPT-4o-mini)
    │ Expands: ML → Machine Learning
    │ Extracts: skills=["Machine Learning"], min_years=5
    ▼
[2] Cache Check (Redis)
    │ Key: "parse:{query_hash}"
    │ TTL: 1 hour
    ▼
[3] Embedding Generation (OpenAI text-embedding-3-small)
    │ Converts keywords to 1536-dim vector
    │ Cached in Redis (24h TTL)
    ▼
[4] Hybrid Search (PostgreSQL)
    │ Vector Search: Cosine similarity (60% weight)
    │ Keyword Search: Full-text search (40% weight)
    │ Filters: Skills, experience, education
    ▼
[5] Result Ranking & Formatting
    │ Score calculation
    │ Match reason generation
    ▼
[6] Response to Client
    JSON with candidates + metadata
```

### 2.3 Search Algorithm Details

**Hybrid Scoring Formula:**
```
final_score = (vector_similarity * 0.6) + (keyword_rank * 0.4)

Where:
- vector_similarity = 1 - cosine_distance(query_embedding, profile_embedding)
- keyword_rank = ts_rank(profile_text, query_keywords)
```

**Filtering Logic:**
```sql
WHERE 
    (required_skills IS NULL OR candidate.skills && required_skills)  -- Array overlap
    AND (min_years IS NULL OR candidate.years_experience >= min_years)
    AND (vector_similarity > 0.65 OR keyword_rank > 0)  -- Minimum relevance threshold
```

---

## 3. Technology Stack

### 3.1 Core Technologies

| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Language** | Python | 3.11+ | Backend development |
| **API Framework** | FastAPI | 0.109.0 | REST API, async support |
| **Database** | PostgreSQL | 15+ | Primary data store |
| **Vector Extension** | pgvector | 0.2.4 | Vector similarity search |
| **Cache** | Redis | 7.0+ | Query caching, embeddings |
| **LLM** | OpenAI GPT-4o-mini | Latest | Query parsing |
| **Embeddings** | text-embedding-3-small | Latest | Semantic search |
| **ASGI Server** | Uvicorn | 0.27.0 | Production server |
| **Deployment** | Railway | N/A | Managed hosting |

### 3.2 Python Dependencies

```txt
#
fastapi==0.109.0
uvicorn[standard]==0.27.0
pydantic==2.5.3
pydantic-settings==2.1.0

# Database
asyncpg==0.29.0
pgvector==0.2.4

# External Services
openai==1.10.0
redis==5.0.1
hiredis==2.3.2

# Utilities
python-dotenv==1.0.0
httpx==0.26.0

# Monitoring (Optional)
sentry-sdk[fastapi]==1.40.0

# Development
pytest==7.4.3
pytest-asyncio==0.21.1
ruff==0.1.9
mypy==1.7.1
```

### 3.3 Infrastructure Components

```yaml
Railway Services:
  - PostgreSQL Database (Starter Plan: $5/mo)
  - Redis Cache (Starter Plan: $5/mo)
  - Web Service (Starter Plan: $5/mo)

External APIs:
  - OpenAI API (Pay-as-you-go)
  - Sentry (Optional, Free tier available)

Estimated Monthly Cost: $15-50
```

---

## 4. Database Schema & Migration Strategy

### 4.1 Current Schema (Version 1.0)

```sql
-- Main candidates table
CREATE TABLE candidates (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Information
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    
    -- Career Information
    current_title TEXT,
    current_company TEXT,
    years_experience INTEGER,
    skills TEXT[] DEFAULT '{}',
    education JSONB DEFAULT '{}',
    
    -- External Links
    linkedin_url TEXT,
    scholar_url TEXT,
    
    -- Search Fields
    profile_text TEXT NOT NULL,
    profile_embedding VECTOR(1536),
    
    -- Metadata
    last_updated TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_years CHECK (years_experience >= 0 AND years_experience <= 70)
);

-- Indexes
CREATE INDEX idx_skills ON candidates USING GIN(skills);
CREATE INDEX idx_profile_fts ON candidates USING GIN(to_tsvector('english', profile_text));
CREATE INDEX idx_profile_vector ON candidates USING ivfflat (profile_embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_years_exp ON candidates(years_experience);
CREATE INDEX idx_email ON candidates(email);
CREATE INDEX idx_created_at ON candidates(created_at);
```

### 4.2 Schema Design Rationale

| Field | Type | Rationale |
|-------|------|-----------|
| `id` | UUID | Globally unique, no collision risk |
| `skills` | TEXT[] | PostgreSQL array for efficient overlap queries |
| `education` | JSONB | Flexible structure for varying education formats |
| `profile_embedding` | VECTOR(1536) | OpenAI embedding dimension |
| `profile_text` | TEXT | Concatenated profile for full-text search |

### 4.3 Migration Strategy

**⚠️ IMPORTANT: Always use migrations for schema changes**

#### 4.3.1 Migration Tool Setup

```bash
# Install Alembic (migration tool)
pip install alembic asyncpg

# Initialize Alembic
alembic init migrations

# Configure alembic.ini
# Set: sqlalchemy.url = postgresql+asyncpg://...
```

#### 4.3.2 Migration File Structure

```
migrations/
├── versions/
│   ├── 001_initial_schema.sql
│   ├── 002_add_location_field.sql
│   ├── 003_add_publications_table.sql
│   └── ...
├── alembic.ini
└── env.py
```

#### 4.3.3 Example Migration: Adding a Column

**File:** `migrations/versions/002_add_location_field.sql`

```sql
-- Migration: Add location field
-- Version: 002
-- Date: 2024-XX-XX
-- Description: Add location tracking for candidates

-- UP Migration
BEGIN;

-- Add new column
ALTER TABLE candidates 
ADD COLUMN location TEXT;

-- Add index for location searches
CREATE INDEX idx_location ON candidates(location);

-- Backfill existing data (optional)
UPDATE candidates 
SET location = 'Unknown' 
WHERE location IS NULL;

COMMIT;

-- DOWN Migration (Rollback)
-- BEGIN;
-- DROP INDEX IF EXISTS idx_location;
-- ALTER TABLE candidates DROP COLUMN IF EXISTS location;
-- COMMIT;
```

#### 4.3.4 Example Migration: Changing Column Type

**File:** `migrations/versions/003_change_years_experience_type.sql`

```sql
-- Migration: Change years_experience to DECIMAL
-- Version: 003
-- Date: 2024-XX-XX
-- Description: Support fractional years (e.g., 5.5 years)

-- UP Migration
BEGIN;

-- Create new column
ALTER TABLE candidates 
ADD COLUMN years_experience_new DECIMAL(4,1);

-- Copy data with conversion
UPDATE candidates 
SET years_experience_new = years_experience::DECIMAL(4,1);

-- Drop old column
ALTER TABLE candidates 
DROP COLUMN years_experience;

-- Rename new column
ALTER TABLE candidates 
RENAME COLUMN years_experience_new TO years_experience;

-- Recreate index
DROP INDEX IF EXISTS idx_years_exp;
CREATE INDEX idx_years_exp ON candidates(years_experience);

-- Update constraint
ALTER TABLE candidates 
DROP CONSTRAINT IF EXISTS valid_years;

ALTER TABLE candidates 
ADD CONSTRAINT valid_years 
CHECK (years_experience >= 0 AND years_experience <= 70);

COMMIT;

-- DOWN Migration
-- BEGIN;
-- ALTER TABLE candidates ADD COLUMN years_experience_old INTEGER;
-- UPDATE candidates SET years_experience_old = FLOOR(years_experience);
-- ALTER TABLE candidates DROP COLUMN years_experience;
-- ALTER TABLE candidates RENAME COLUMN years_experience_old TO years_experience;
-- CREATE INDEX idx_years_exp ON candidates(years_experience);
-- COMMIT;
```

#### 4.3.5 Example Migration: Adding a New Table

**File:** `migrations/versions/004_add_publications_table.sql`

```sql
-- Migration: Add publications table
-- Version: 004
-- Date: 2024-XX-XX
-- Description: Track academic publications separately

-- UP Migration
BEGIN;

CREATE TABLE publications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    
    title TEXT NOT NULL,
    authors TEXT[],
    venue TEXT,
    year INTEGER,
    citation_count INTEGER DEFAULT 0,
    url TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    CONSTRAINT valid_year CHECK (year >= 1900 AND year <= 2100)
);

-- Indexes
CREATE INDEX idx_publications_candidate ON publications(candidate_id);
CREATE INDEX idx_publications_year ON publications(year);
CREATE INDEX idx_publications_venue ON publications(venue);

-- Update candidates table to track publication count
ALTER TABLE candidates 
ADD COLUMN publication_count INTEGER DEFAULT 0;

-- Create trigger to auto-update publication count
CREATE OR REPLACE FUNCTION update_publication_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE candidates 
        SET publication_count = publication_count + 1 
        WHERE id = NEW.candidate_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE candidates 
        SET publication_count = publication_count - 1 
        WHERE id = OLD.candidate_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_publication_count
AFTER INSERT OR DELETE ON publications
FOR EACH ROW EXECUTE FUNCTION update_publication_count();

COMMIT;

-- DOWN Migration
-- BEGIN;
-- DROP TRIGGER IF EXISTS trigger_update_publication_count ON publications;
-- DROP FUNCTION IF EXISTS update_publication_count();
-- ALTER TABLE candidates DROP COLUMN IF EXISTS publication_count;
-- DROP TABLE IF EXISTS publications;
-- COMMIT;
```

#### 4.3.6 Migration Execution Process

```bash
# 1. Create migration file
touch migrations/versions/00X_description.sql

# 2. Test migration locally
psql $DATABASE_URL -f migrations/versions/00X_description.sql

# 3. Verify schema
psql $DATABASE_URL -c "\d candidates"

# 4. Run tests
pytest tests/

# 5. Deploy to Railway
railway run psql $DATABASE_URL -f migrations/versions/00X_description.sql

# 6. Verify in production
railway run psql $DATABASE_URL -c "SELECT COUNT(*) FROM candidates"
```

#### 4.3.7 Migration Best Practices

```python
# migrations/migration_manager.py

import asyncpg
import os
from pathlib import Path

class MigrationManager:
    """Manages database migrations"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.migrations_dir = Path("migrations/versions")
    
    async def create_migration_table(self):
        """Create table to track applied migrations"""
        conn = await asyncpg.connect(self.db_url)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TIMESTAMP DEFAULT NOW()
            )
        """)
        await conn.close()
    
    async def get_applied_migrations(self) -> set:
        """Get list of applied migration versions"""
        conn = await asyncpg.connect(self.db_url)
        rows = await conn.fetch("SELECT version FROM schema_migrations")
        await conn.close()
        return {row['version'] for row in rows}
    
    async def apply_migration(self, version: int, name: str, sql: str):
        """Apply a single migration"""
        conn = await asyncpg.connect(self.db_url)
        try:
            # Execute migration SQL
            await conn.execute(sql)
            
            # Record migration
            await conn.execute(
                "INSERT INTO schema_migrations (version, name) VALUES ($1, $2)",
                version, name
            )
            print(f"✅ Applied migration {version}: {name}")
        except Exception as e:
            print(f"❌ Failed to apply migration {version}: {e}")
            raise
        finally:
            await conn.close()
    
    async def run_migrations(self):
        """Run all pending migrations"""
        await self.create_migration_table()
        applied = await self.get_applied_migrations()
        
        # Get all migration files
        migration_files = sorted(self.migrations_dir.glob("*.sql"))
        
        for file in migration_files:
            # Extract version from filename (e.g., 001_initial.sql -> 1)
            version = int(file.stem.split('_')[0])
            
            if version not in applied:
                sql = file.read_text()
                # Extract UP migration (before DOWN comment)
                up_sql = sql.split('-- DOWN Migration')[0]
                await self.apply_migration(version, file.stem, up_sql)

# Usage
if __name__ == "__main__":
    import asyncio
    manager = MigrationManager(os.getenv("DATABASE_URL"))
    asyncio.run(manager.run_migrations())
```

#### 4.3.8 Code Updates After Schema Changes

**When adding a column:**

```python
# 1. Update models.py
class Candidate(BaseModel):
    # ... existing fields ...
    location: Optional[str] = None  # NEW FIELD

# 2. Update search.py if needed
async def search_candidates(parsed_query: ParsedQuery, limit: int = 50):
    sql = """
    SELECT 
        c.id, c.name, c.email, c.current_title, c.current_company,
        c.years_experience, c.skills, c.education, c.linkedin_url,
        c.scholar_url, c.profile_text, c.last_updated,
        c.location,  -- NEW FIELD
        ...
    """

# 3. Update any INSERT/UPDATE queries
# 4. Update tests
# 5. Update API documentation
```

**When adding a table:**

```python
# 1. Create new model
class Publication(BaseModel):
    id: UUID
    candidate_id: UUID
    title: str
    authors: List[str]
    venue: Optional[str]
    year: Optional[int]
    citation_count: int = 0
    url: Optional[str]

# 2. Create new endpoints
@app.get("/candidates/{candidate_id}/publications")
async def get_publications(candidate_id: UUID):
    # Implementation

# 3. Update search logic if publications affect ranking
```

### 4.4 Schema Versioning

```python
# app/database.py

SCHEMA_VERSION = "1.0.4"  # Update with each migration

async def check_schema_version():
    """Verify database schema matches application version"""
    async with db.acquire() as conn:
        result = await conn.fetchval(
            "SELECT MAX(version) FROM schema_migrations"
        )
        expected_version = int(SCHEMA_VERSION.replace('.', ''))
        
        if result != expected_version:
            raise RuntimeError(
                f"Schema version mismatch! "
                f"Database: {result}, Expected: {expected_version}"
            )
```

---

## 5. Codebase Structure

### 5.1 Directory Layout

```
candidate-search/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application entry point
│   ├── config.py            # Configuration management
│   ├── database.py          # Database connection & pooling
│   ├── models.py            # Pydantic models
│   ├── search.py            # Search logic
│   ├── llm.py               # LLM integration (OpenAI)
│   └── utils.py             # Helper functions
│
├── migrations/
│   ├── versions/
│   │   ├── 001_initial_schema.sql
│   │   └── ...
│   └── migration_manager.py
│
├── scripts/
│   ├── add_sample_data.py   # Populate test data
│   ├── ingest_linkedin.py   # LinkedIn data ingestion
│   └── ingest_scholar.py    # Google Scholar ingestion
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Pytest fixtures
│   ├── test_search.py       # Search tests
│   ├── test_llm.py          # LLM parsing tests
│   └── test_api.py          # API endpoint tests
│
├── .env.example             # Environment variables template
├── .gitignore
├── Procfile                 # Railway process definition
├── railway.json             # Railway configuration
├── requirements.txt         # Python dependencies
├── pytest.ini               # Pytest configuration
└── README.md
```

### 5.2 Key Files Explained

#### 5.2.1 `app/main.py` - Application Entry Point

**Purpose:** FastAPI application setup, routing, middleware

**Key Components:**
- Lifespan management (startup/shutdown)
- CORS configuration
- Route definitions
- Error handling
- Health checks

**Critical Code Sections:**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manages application lifecycle"""
    # Startup: Connect to database, initialize services
    await db.connect()
    await check_schema_version()  # Verify schema compatibility
    
    yield
    
    # Shutdown: Close connections gracefully
    await db.disconnect()

# Middleware for request timing
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    return response
```

#### 5.2.2 `app/config.py` - Configuration Management

**Purpose:** Centralized configuration using Pydantic Settings

**Environment Variables:**
```python
DATABASE_URL: str           # PostgreSQL connection string
REDIS_URL: str             # Redis connection string
OPENAI_API_KEY: str        # OpenAI API key
SENTRY_DSN: str | None     # Sentry error tracking (optional)
DEBUG: bool = False        # Debug mode flag
```

**Usage Pattern:**
```python
from app.config import get_settings

settings = get_settings()  # Cached singleton
db_url = settings.database_url
```

#### 5.2.3 `app/database.py` - Database Management

**Purpose:** Connection pooling, query execution

**Key Features:**
- Async connection pool (asyncpg)
- Context manager for connection acquisition
- Automatic reconnection handling
- pgvector extension initialization

**Connection Pool Configuration:**
```python
self.pool = await asyncpg.create_pool(
    settings.database_url,
    min_size=2,        # Minimum connections
    max_size=10,       # Maximum connections
    command_timeout=60 # Query timeout (seconds)
)
```

#### 5.2.4 `app/models.py` - Data Models

**Purpose:** Pydantic models for validation and serialization

**Model Hierarchy:**
```
BaseModel (Pydantic)
├── Candidate          # Database entity
├── SearchQuery        # API request
├── ParsedQuery        # LLM output
├── SearchResult       # Single result
└── SearchResponse     # API response
```

**Validation Examples:**
```python
class Candidate(BaseModel):
    email: EmailStr  # Automatic email validation
    years_experience: Optional[int] = Field(ge=0, le=70)  # Range validation
    skills: List[str] = Field(default_factory=list)  # Default empty list
```

#### 5.2.5 `app/llm.py` - LLM Integration

**Purpose:** Query parsing and embedding generation

**Key Functions:**

1. **`parse_query(natural_query: str) -> ParsedQuery`**
   - Converts natural language to structured filters
   - Expands abbreviations
   - Caches results in Redis (1 hour TTL)
   - Uses GPT-4o-mini for cost efficiency

2. **`get_embedding(text: str) -> List[float]`**
   - Generates 1536-dimensional embeddings
   - Caches in Redis (24 hour TTL)
   - Uses text-embedding-3-small model

**Caching Strategy:**
```python
cache_key = f"parse:{natural_query}"
cached = await redis_client.get(cache_key)
if cached:
    return ParsedQuery(**json.loads(cached))

# ... LLM call ...

await redis_client.setex(cache_key, 3600, result.model_dump_json())
```

#### 5.2.6 `app/search.py` - Search Engine

**Purpose:** Hybrid search implementation

**Search Flow:**
1. Generate query embedding
2. Execute hybrid SQL query (vector + keyword)
3. Apply filters (skills, experience, education)
4. Rank results by combined score
5. Generate match reasons

**Performance Considerations:**
- Uses prepared statements for SQL injection prevention
- Leverages PostgreSQL indexes (GIN, IVFFlat)
- Limits result set to prevent memory issues
- Async execution for non-blocking I/O

**Scoring Weights:**
```python
final_score = (vector_score * 0.6) + (keyword_score * 0.4)
```

*Rationale:* Semantic understanding (vector) is prioritized over exact keyword matching, but both contribute to relevance.

---

## 6. Key Implementation Details

### 6.1 Query Parsing Logic

**Input:** Natural language query  
**Output:** Structured filters

**Example Transformations:**

| Input | Parsed Output |
|-------|---------------|
| "ML engineer with 5+ years" | `{skills: ["Machine Learning"], min_years: 5}` |
| "Senior NLP researcher, PhD" | `{skills: ["Natural Language Processing"], education: "PhD"}` |
| "Python dev at FAANG" | `{skills: ["Python"], companies: ["Facebook", "Amazon", "Apple", "Netflix", "Google"]}` |

**LLM Prompt Template:**

```python
prompt = f"""Parse this candidate search query into structured filters.

Query: "{natural_query}"

Extract and expand abbreviations:
- required_skills: list of skills (expand: ML→Machine Learning, NLP→Natural Language Processing, CV→Computer Vision, DL→Deep Learning, etc.)
- min_years_experience: number or null
- education_level: "PhD" or "Masters" or "Bachelors" or null
- keywords: important search terms (expanded and cleaned)
- company_preferences: list of companies or null

Return ONLY valid JSON with these exact keys.
"""
```

**Error Handling:**
```python
try:
    parsed = ParsedQuery(**json.loads(llm_response))
except ValidationError as e:
    # Fallback: Use query as-is for keyword search
    parsed = ParsedQuery(keywords=natural_query)
```

### 6.2 Embedding Generation

**Model:** OpenAI text-embedding-3-small  
**Dimensions:** 1536  
**Cost:** $0.02 per 1M tokens

**Input Preparation:**
```python
# Concatenate relevant profile fields
profile_text = f"{candidate.name} {candidate.current_title} at {candidate.current_company}. "
profile_text += f"Skills: {', '.join(candidate.skills)}. "
profile_text += f"{candidate.years_experience} years of experience. "
profile_text += candidate.education.get('summary', '')
```

**Batch Processing:**
```python
# Process in batches of 100 for efficiency
for i in range(0, len(profiles), 100):
    batch = profiles[i:i+100]
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=batch
    )
    embeddings.extend([e.embedding for e in response.data])
```

### 6.3 Hybrid Search Implementation

**SQL Query Breakdown:**

```sql
-- Step 1: Vector Search CTE
WITH vector_search AS (
    SELECT 
        id,
        1 - (profile_embedding <=> $1::vector) AS vector_score
    FROM candidates
    WHERE 1 - (profile_embedding <=> $1::vector) > 0.65  -- Similarity threshold
),

-- Step 2: Keyword Search CTE
keyword_search AS (
    SELECT 
        id,
        ts_rank(to_tsvector('english', profile_text), 
                plainto_tsquery('english', $2)) AS keyword_score
    FROM candidates
    WHERE to_tsvector('english', profile_text) @@ plainto_tsquery('english', $2)
)

-- Step 3: Combine and Filter
SELECT 
    c.*,
    COALESCE(v.vector_score, 0) * 0.6 + 
    COALESCE(k.keyword_score, 0) * 0.4 AS final_score
FROM candidates c
LEFT JOIN vector_search v ON c.id = v.id
LEFT JOIN keyword_search k ON c.id = k.id
WHERE 
    -- Filter by skills (array overlap)
    ($3::text[] IS NULL OR c.skills && $3::text[])
    
    -- Filter by experience
    AND ($4::int IS NULL OR c.years_experience >= $4)
    
    -- Must have some relevance
    AND (COALESCE(v.vector_score, 0) > 0 OR COALESCE(k.keyword_score, 0) > 0)
ORDER BY final_score DESC
LIMIT $5
```

**Index Usage:**
- `idx_profile_vector`: IVFFlat index for vector similarity (approximate nearest neighbor)
- `idx_profile_fts`: GIN index for full-text search
- `idx_skills`: GIN index for array overlap operations

**Performance Tuning:**

```sql
-- Adjust IVFFlat lists parameter based on data size
-- Rule of thumb: lists = sqrt(row_count)
-- For 100K candidates: lists = 316
-- For 1M candidates: lists = 1000

CREATE INDEX idx_profile_vector ON candidates 
USING ivfflat (profile_embedding vector_cosine_ops) 
WITH (lists = 316);

-- Analyze table for query planner
ANALYZE candidates;
```

### 6.4 Caching Strategy

**Cache Layers:**

1. **Query Parse Cache**
   - Key: `parse:{query_text}`
   - TTL: 1 hour
   - Rationale: Same queries are common

2. **Embedding Cache**
   - Key: `embed:{text_hash}`
   - TTL: 24 hours
   - Rationale: Embeddings are expensive to generate

3. **Search Result Cache** (Optional)
   - Key: `search:{query_hash}:{filters_hash}`
   - TTL: 5 minutes
   - Rationale: Real-time data updates

**Cache Invalidation:**
```python
# When candidate data changes
async def update_candidate(candidate_id: UUID, updates: dict):
    # Update database
    await db.execute("UPDATE candidates SET ... WHERE id = $1", candidate_id)
    
    # Invalidate related caches
    await redis_client.delete(f"candidate:{candidate_id}")
    
    # Optionally: Clear all search caches
    # await redis_client.delete_pattern("search:*")
```

### 6.5 Error Handling

**Error Categories:**

1. **Database Errors**
```python
try:
    results = await search_candidates(parsed_query)
except asyncpg.PostgresError as e:
    logger.error(f"Database error: {e}")
    raise HTTPException(status_code=503, detail="Database unavailable")
```

2. **LLM API Errors**
```python
try:
    parsed = await parse_query(query)
except openai.APIError as e:
    logger.error(f"OpenAI API error: {e}")
    # Fallback: Use query as-is
    parsed = ParsedQuery(keywords=query)
```

3. **Validation Errors**
```python
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": exc.body}
    )
```

**Retry Logic:**
```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10)
)
async def call_openai_with_retry(prompt: str):
    return await client.chat.completions.create(...)
```

---

## 7. Deployment Configuration

### 7.1 Railway Setup

**Services Required:**
1. PostgreSQL Database
2. Redis Cache
3. Web Service (FastAPI app)

**Environment Variables:**

```bash
# Auto-populated by Railway
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Must be set manually
OPENAI_API_KEY=sk-...
SENTRY_DSN=https://...  # Optional
DEBUG=false
```

### 7.2 Procfile

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2
```

**Worker Configuration:**
- `--workers 2`: Number of worker processes
- Calculation: `(2 * CPU_cores) + 1`
- Railway Starter: 1 vCPU → 2-3 workers recommended

### 7.3 railway.json

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 2",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30
  }
}
```

### 7.4 Health Check Endpoint

```python
@app.get("/health")
async def health_check():
    """
    Health check for Railway and monitoring
    Returns 200 if all services are operational
    """
    checks = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {}
    }
    
    # Check database
    try:
        async with db.acquire() as conn:
            await conn.fetchval("SELECT 1")
        checks["services"]["database"] = "connected"
    except Exception as e:
        checks["services"]["database"] = f"error: {str(e)}"
        checks["status"] = "unhealthy"
    
    # Check Redis
    try:
        await redis_client.ping()
        checks["services"]["redis"] = "connected"
    except Exception as e:
        checks["services"]["redis"] = f"error: {str(e)}"
        checks["status"] = "unhealthy"
    
    # Check OpenAI (optional, can be slow)
    # checks["services"]["openai"] = "not checked"
    
    status_code = 200 if checks["status"] == "healthy" else 503
    return JSONResponse(content=checks, status_code=status_code)
```

### 7.5 Deployment Checklist

```markdown
## Pre-Deployment
- [ ] Run tests locally: `pytest tests/`
- [ ] Check migrations: `python migrations/migration_manager.py`
- [ ] Verify environment variables in `.env`
- [ ] Review `requirements.txt` for version conflicts
- [ ] Test with production-like data volume

## Deployment
- [ ] Push to Railway: `railway up` or Git push
- [ ] Monitor build logs
- [ ] Run migrations: `railway run python migrations/migration_manager.py`
- [ ] Verify health check: `curl https://your-app.railway.app/health`
- [ ] Test search endpoint with sample queries

## Post-Deployment
- [ ] Monitor error rates in Sentry
- [ ] Check response times
- [ ] Verify database connections
- [ ] Test with real user queries
- [ ] Set up alerts for downtime
```

---

## 8. API Endpoints

### 8.1 Endpoint Documentation

#### POST `/search`

**Purpose:** Search candidates with natural language query

**Request:**
```json
{
  "query": "Find ML engineers with 5+ years experience and PhD",
  "limit": 50
}
```

**Response:**
```json
{
  "results": [
    {
      "candidate": {
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "current_title": "Senior ML Engineer",
        "current_company": "Meta",
        "years_experience": 8,
        "skills": ["Machine Learning", "Python", "PyTorch", "NLP"],
        "education": {"degree": "PhD", "field": "Computer Science"},
        "linkedin_url": "https://linkedin.com/in/alice",
        "scholar_url": "https://scholar.google.com/citations?user=...",
        "profile_text": "Senior ML Engineer specializing in NLP...",
        "last_updated": "2024-01-15T10:30:00Z"
      },
      "score": 0.92,
      "match_reasons": [
        "Strong semantic match",
        "Skills: Machine Learning, Python",
        "8 years experience (exceeds minimum)"
      ]
    }
  ],
  "total": 15,
  "query_time_ms": 234.5
}
```

**Status Codes:**
- `200`: Success
- `422`: Validation error (invalid request format)
- `500`: Server error (database/LLM failure)
- `503`: Service unavailable (health check failed)

**Rate Limiting:** Not implemented (add if needed)

**Example cURL:**
```bash
curl -X POST https://your-app.railway.app/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Senior Python developer with cloud experience",
    "limit": 20
  }'
```

#### GET `/health`

**Purpose:** Health check for monitoring

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

#### GET `/debug/parse`

**Purpose:** Debug query parsing (development only)

**Request:**
```
GET /debug/parse?query=ML%20engineer%20with%205%2B%20years
```

**Response:**
```json
{
  "required_skills": ["Machine Learning"],
  "min_years_experience": 5,
  "education_level": null,
  "keywords": "Machine Learning engineer experience",
  "company_preferences": null
}
```

**⚠️ Security:** Disable in production or add authentication

### 8.2 API Versioning Strategy

**Current:** No versioning (v1 implicit)

**Future Versioning:**
```python
# Option 1: URL path versioning
@app.post("/v1/search")
@app.post("/v2/search")

# Option 2: Header versioning
@app.post("/search")
async def search(request: Request, query: SearchQuery):
    api_version = request.headers.get("API-Version", "v1")
    if api_version == "v2":
        # New behavior
    else:
        # Legacy behavior
```

### 8.3 OpenAPI Documentation

**Auto-generated at:** `/docs` (Swagger UI) and `/redoc` (ReDoc)

**Customization:**
```python
app = FastAPI(
    title="Candidate Search API",
    description="Search candidates using natural language queries",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "search", "description": "Search operations"},
        {"name": "health", "description": "Health checks"}
    ]
)

@app.post("/search", tags=["search"])
async def search(...):
    """
    Search candidates with natural language.
    
    ## Examples
    - "Find ML engineers with 5+ years experience"
    - "Senior developers at FAANG companies"
    - "PhD researchers in NLP"
    
    ## Response
    Returns ranked list of matching candidates with scores.
    """
```

---

## 9. Development Workflow

### 9.1 Local Development Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd candidate-search

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Set up local services (Docker)
docker-compose up -d

# 5. Create .env file
cp .env.example .env
# Edit .env with your API keys

# 6. Run migrations
python migrations/migration_manager.py

# 7. Add sample data
python scripts/add_sample_data.py

# 8. Start development server
uvicorn app.main:app --reload --port 8000
```

### 9.2 Docker Compose for Local Development

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  postgres:
    image: ankane/pgvector:latest
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: candidates
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

volumes:
  pgdata:
  redisdata:
```

### 9.3 Environment Variables

**.env.example:**
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/candidates

# Redis
REDIS_URL=redis://localhost:6379

# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Application
DEBUG=true
APP_NAME=Candidate Search API

# Monitoring (Optional)
SENTRY_DSN=

# Search Configuration
VECTOR_SIMILARITY_THRESHOLD=0.65
MAX_SEARCH_RESULTS=100
```

### 9.4 Code Quality Tools

**Linting & Formatting:**
```bash
# Install tools
pip install ruff mypy

# Run linter
ruff check app/ tests/

# Auto-fix issues
ruff check --fix app/ tests/

# Type checking
mypy app/
```

**Pre-commit Hooks:**
```bash
# Install pre-commit
pip install pre-commit

# Create .pre-commit-config.yaml
cat > .pre-commit-config.yaml << EOF
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.1.9
    hooks:
      - id: ruff
        args: [--fix]
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.7.1
    hooks:
      - id: mypy
        additional_dependencies: [types-redis]
EOF

# Install hooks
pre-commit install
```

### 9.5 Git Workflow

**Branch Strategy:**
```
main (production)
  ├── develop (staging)
  │   ├── feature/add-location-search
  │   ├── feature/improve-ranking
  │   └── bugfix/fix-embedding-cache
  └── hotfix/critical-bug
```

**Commit Message Convention:**
```
<type>(<scope>): <subject>

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- refactor: Code refactoring
- test: Adding tests
- chore: Maintenance

Examples:
feat(search): add location-based filtering
fix(llm): handle OpenAI rate limit errors
docs(api): update search endpoint examples
```

---

## 10. Testing Strategy

### 10.1 Test Structure

```
tests/
├── conftest.py              # Shared fixtures
├── test_api.py              # API endpoint tests
├── test_search.py           # Search logic tests
├── test_llm.py              # LLM integration tests
├── test_database.py         # Database operations
└── test_integration.py      # End-to-end tests
```

### 10.2 Pytest Configuration

**pytest.ini:**
```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
asyncio_mode = auto
markers =
    slow: marks tests as slow (deselect with '-m "not slow"')
    integration: marks tests as integration tests
    unit: marks tests as unit tests
```

### 10.3 Test Fixtures

**conftest.py:**
```python
import pytest
import asyncpg
from httpx import AsyncClient
from app.main import app
from app.database import db
from app.config import get_settings

@pytest.fixture
async def test_db():
    """Create test database connection"""
    settings = get_settings()
    conn = await asyncpg.connect(settings.database_url)
    
    # Create test schema
    await conn.execute("CREATE SCHEMA IF NOT EXISTS test")
    await conn.execute("SET search_path TO test")
    
    yield conn
    
    # Cleanup
    await conn.execute("DROP SCHEMA test CASCADE")
    await conn.close()

@pytest.fixture
async def client():
    """Create test client"""
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac

@pytest.fixture
def sample_candidate():
    """Sample candidate data"""
    return {
        "name": "Test User",
        "email": "test@example.com",
        "current_title": "ML Engineer",
        "years_experience": 5,
        "skills": ["Python", "Machine Learning"],
        "profile_text": "ML Engineer with 5 years experience"
    }
```

### 10.4 Unit Tests

**test_llm.py:**
```python
import pytest
from app.llm import parse_query
from app.models import ParsedQuery

@pytest.mark.asyncio
async def test_parse_simple_query():
    """Test parsing simple query"""
    result = await parse_query("ML engineer with 5 years")
    
    assert "Machine Learning" in result.required_skills
    assert result.min_years_experience == 5

@pytest.mark.asyncio
async def test_parse_abbreviations():
    """Test abbreviation expansion"""
    result = await parse_query("NLP researcher with PhD")
    
    assert "Natural Language Processing" in result.required_skills
    assert result.education_level == "PhD"

@pytest.mark.asyncio
async def test_parse_cache():
    """Test query parsing cache"""
    query = "Senior Python developer"
    
    # First call (cache miss)
    result1 = await parse_query(query)
    
    # Second call (cache hit)
    result2 = await parse_query(query)
    
    assert result1.model_dump() == result2.model_dump()
```

**test_search.py:**
```python
import pytest
from app.search import search_candidates
from app.models import ParsedQuery

@pytest.mark.asyncio
async def test_search_by_skills(test_db, sample_candidate):
    """Test searching by skills"""
    # Insert test candidate
    await test_db.execute("""
        INSERT INTO candidates (name, email, skills, profile_text, profile_embedding)
        VALUES ($1, $2, $3, $4, $5)
    """, sample_candidate["name"], sample_candidate["email"], 
        sample_candidate["skills"], sample_candidate["profile_text"],
        [0.1] * 1536)  # Dummy embedding
    
    # Search
    parsed = ParsedQuery(
        required_skills=["Python"],
        keywords="Python developer"
    )
    results, _ = await search_candidates(parsed, limit=10)
    
    assert len(results) > 0
    assert results[0].candidate.email == sample_candidate["email"]

@pytest.mark.asyncio
async def test_search_by_experience(test_db):
    """Test filtering by years of experience"""
    parsed = ParsedQuery(
        min_years_experience=5,
        keywords="engineer"
    )
    results, _ = await search_candidates(parsed, limit=10)
    
    for result in results:
        assert result.candidate.years_experience >= 5
```

### 10.5 Integration Tests

**test_integration.py:**
```python
import pytest
from httpx import AsyncClient

@pytest.mark.integration
@pytest.mark.asyncio
async def test_full_search_flow(client):
    """Test complete search flow"""
    response = await client.post("/search", json={
        "query": "ML engineer with 5+ years",
        "limit": 10
    })
    
    assert response.status_code == 200
    data = response.json()
    
    assert "results" in data
    assert "total" in data
    assert "query_time_ms" in data
    assert data["query_time_ms"] < 2000  # Under 2 seconds

@pytest.mark.integration
@pytest.mark.asyncio
async def test_health_check(client):
    """Test health check endpoint"""
    response = await client.get("/health")
    
    assert response.status_code == 200
    data = response.json()
    
    assert data["status"] == "healthy"
    assert "database" in data["services"]
    assert "redis" in data["services"]
```

### 10.6 Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html

# Run specific test file
pytest tests/test_search.py

# Run specific test
pytest tests/test_search.py::test_search_by_skills

# Run only unit tests
pytest -m unit

# Run excluding slow tests
pytest -m "not slow"

# Verbose output
pytest -v

# Stop on first failure
pytest -x
```

### 10.7 Test Coverage Goals

```
Minimum Coverage Targets:
- Overall: 80%
- Core modules (search.py, llm.py): 90%
- API endpoints: 85%
- Database operations: 75%
```

---

## 11. Monitoring & Observability

### 11.1 Logging Strategy

**Log Levels:**
```python
import logging
from app.config import get_settings

settings = get_settings()

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Usage
logger.info("Search query received", extra={"query": query})
logger.error("Database connection failed", exc_info=True)
logger.warning("High response time", extra={"time_ms": 1500})
```

**Structured Logging:**
```python
import structlog

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ]
)

log = structlog.get_logger()

log.info("search_executed", 
         query=query, 
         results_count=len(results),
         query_time_ms=query_time)
```

### 11.2 Metrics Collection

**Key Metrics:**

1. **Request Metrics**
   - Request count
   - Response time (p50, p95, p99)
   - Error rate
   - Status code distribution

2. **Search Metrics**
   - Query parse time
   - Embedding generation time
   - Database query time
   - Cache hit rate

3. **System Metrics**
   - Database connection pool usage
   - Redis memory usage
   - API rate limits (OpenAI)

**Implementation:**
```python
from prometheus_client import Counter, Histogram, Gauge
import time

# Define metrics
search_requests = Counter('search_requests_total', 'Total search requests')
search_duration = Histogram('search_duration_seconds', 'Search duration')
cache_hits = Counter('cache_hits_total', 'Cache hits', ['cache_type'])
db_connections = Gauge('db_connections_active', 'Active DB connections')

# Usage
@app.post("/search")
async def search(query: SearchQuery):
    search_requests.inc()
    
    start_time = time.time()
    try:
        results = await search_candidates(...)
        search_duration.observe(time.time() - start_time)
        return results
    except Exception as e:
        logger.error("Search failed", exc_info=True)
        raise

# Expose metrics endpoint
from prometheus_client import make_asgi_app
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
```

### 11.3 Error Tracking (Sentry)

**Setup:**
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.asyncpg import AsyncPGIntegration

sentry_sdk.init(
    dsn=settings.sentry_dsn,
    integrations=[
        FastApiIntegration(),
        AsyncPGIntegration()
    ],
    traces_sample_rate=0.1,  # 10% of transactions
    environment="production" if not settings.debug else "development",
    release="candidate-search@1.0.0"
)

# Custom context
with sentry_sdk.configure_scope() as scope:
    scope.set_tag("component", "search")
    scope.set_context("query", {"text": query, "limit": limit})
```

### 11.4 Performance Monitoring

**Response Time Tracking:**
```python
@app.middleware("http")
async def track_performance(request: Request, call_next):
    start_time = time.time()
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    
    # Log slow requests
    if process_time > 1.0:
        logger.warning("Slow request", extra={
            "path": request.url.path,
            "method": request.method,
            "time_ms": process_time * 1000
        })
    
    return response
```

**Database Query Monitoring:**
```python
async def execute_with_timing(conn, query, *args):
    """Execute query with timing"""
    start = time.time()
    result = await conn.fetch(query, *args)
    duration = time.time() - start
    
    if duration > 0.5:
        logger.warning("Slow query", extra={
            "query": query[:100],
            "duration_ms": duration * 1000
        })
    
    return result
```

### 11.5 Alerting Rules

**Critical Alerts:**
```yaml
# Example: Grafana/Prometheus alerts

- alert: HighErrorRate
  expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.05
  for: 5m
  annotations:
    summary: "High error rate detected"

- alert: SlowResponseTime
  expr: histogram_quantile(0.95, search_duration_seconds) > 2
  for: 10m
  annotations:
    summary: "95th percentile response time > 2s"

- alert: DatabaseConnectionPoolExhausted
  expr: db_connections_active >= 9
  for: 5m
  annotations:
    summary: "Database connection pool near capacity"
```

### 11.6 Dashboard Recommendations

**Key Visualizations:**

1. **Request Overview**
   - Requests per minute (line chart)
   - Status code distribution (pie chart)
   - Response time percentiles (line chart)

2. **Search Performance**
   - Query parse time (histogram)
   - Database query time (histogram)
   - Cache hit rate (gauge)

3. **System Health**
   - Database connections (gauge)
   - Redis memory usage (line chart)
   - Error rate (line chart)

4. **Business Metrics**
   - Searches per day
   - Most common search terms
   - Average results per search

---

## 12. Known Issues & Future Improvements

### 12.1 Current Limitations

| Issue | Impact | Workaround | Priority |
|-------|--------|------------|----------|
| No authentication | Security risk | Deploy behind VPN/firewall | High |
| No rate limiting | Abuse potential | Monitor usage manually | High |
| Single region deployment | Latency for distant users | Use CDN for static assets | Medium |
| No result caching | Repeated queries slow | Implement search result cache | Medium |
| Limited error recovery | Service disruptions | Add circuit breakers | Medium |
| No batch search API | Inefficient for bulk queries | Process sequentially | Low |

### 12.2 Planned Improvements

#### Phase 1: Security & Stability (1-2 weeks)
```python
# 1. Add API Key Authentication
from fastapi.security import APIKeyHeader

api_key_header = APIKeyHeader(name="X-API-Key")

@app.post("/search")
async def search(query: SearchQuery, api_key: str = Depends(api_key_header)):
    if api_key not in valid_api_keys:
        raise HTTPException(status_code=403, detail="Invalid API key")
    # ... search logic

# 2. Add Rate Limiting
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.post("/search")
@limiter.limit("10/minute")
async def search(request: Request, query: SearchQuery):
    # ... search logic

# 3. Add Circuit Breaker for OpenAI
from circuitbreaker import circuit

@circuit(failure_threshold=5, recovery_timeout=60)
async def call_openai_with_circuit_breaker(prompt: str):
    return await client.chat.completions.create(...)
```

#### Phase 2: Performance Optimization (2-3 weeks)
```python
# 1. Implement Search Result Caching
@app.post("/search")
async def search(query: SearchQuery):
    cache_key = f"search:{hash(query.query)}:{query.limit}"
    cached = await redis_client.get(cache_key)
    
    if cached:
        return SearchResponse(**json.loads(cached))
    
    results = await search_candidates(...)
    await redis_client.setex(cache_key, 300, results.model_dump_json())
    return results

# 2. Add Query Result Pagination
class SearchQuery(BaseModel):
    query: str
    limit: int = 50
    offset: int = 0  # NEW

# 3. Optimize Vector Index
# Increase IVFFlat lists for better performance
CREATE INDEX idx_profile_vector ON candidates 
USING ivfflat (profile_embedding vector_cosine_ops) 
WITH (lists = 1000);  # Increased from 100
```

#### Phase 3: Feature Enhancements (3-4 weeks)
```python
# 1. Add Batch Search API
@app.post("/search/batch")
async def batch_search(queries: List[SearchQuery]):
    tasks = [search_candidates(parse_query(q.query), q.limit) for q in queries]
    results = await asyncio.gather(*tasks)
    return {"results": results}

# 2. Add Search Filters API
class AdvancedSearchQuery(BaseModel):
    query: str
    filters: dict = {
        "min_years": None,
        "max_years": None,
        "skills": [],
        "companies": [],
        "education_levels": [],
        "locations": []
    }

# 3. Add Candidate Recommendations
@app.get("/candidates/{candidate_id}/similar")
async def find_similar_candidates(candidate_id: UUID, limit: int = 10):
    # Find candidates with similar embeddings
    candidate = await get_candidate(candidate_id)
    similar = await search_by_embedding(candidate.profile_embedding, limit)
    return similar
```

### 12.3 Scalability Considerations

**Current Capacity:**
- Database: ~1M candidates (with current indexes)
- Requests: ~100 req/sec (with 2 workers)
- Response time: <1s (for typical queries)

**Scaling Strategies:**

1. **Horizontal Scaling (10M+ candidates)**
```python
# Option 1: Database sharding by candidate ID
# Shard 1: candidates with id starting 0-4
# Shard 2: candidates with id starting 5-9

# Option 2: Separate vector database
# Use Pinecone/Weaviate for vector search
# Keep PostgreSQL for structured data

# Option 3: Read replicas
# Write to primary, read from replicas
```

2. **Caching Improvements**
```python
# Multi-level cache
# L1: In-memory (LRU cache)
# L2: Redis (distributed)
# L3: Database

from functools import lru_cache

@lru_cache(maxsize=1000)
def get_parsed_query_local(query: str):
    # Check local cache first
    pass
```

3. **Async Processing**
```python
# Background tasks for non-critical operations
from fastapi import BackgroundTasks

@app.post("/search")
async def search(query: SearchQuery, background_tasks: BackgroundTasks):
    results = await search_candidates(...)
    
    # Log analytics in background
    background_tasks.add_task(log_search_analytics, query, results)
    
    return results
```

### 12.4 Technical Debt

| Item | Description | Effort | Impact |
|------|-------------|--------|--------|
| Type hints | Add complete type hints to all functions | 2 days | Low |
| Test coverage | Increase from 70% to 90% | 1 week | Medium |
| Documentation | Add docstrings to all public functions | 3 days | Low |
| Error messages | Improve user-facing error messages | 2 days | Medium |
| Configuration | Move hardcoded values to config | 1 day | Low |
| Logging | Standardize logging format | 2 days | Medium |

---

## 13. Troubleshooting Guide

### 13.1 Common Issues

#### Issue: "Database connection failed"

**Symptoms:**
```
asyncpg.exceptions.ConnectionDoesNotExistError: connection was closed in the middle of operation
```

**Causes:**
1. Database service down
2. Connection pool exhausted
3. Network issues
4. Invalid credentials

**Solutions:**
```bash
# 1. Check database status
railway status

# 2. Verify connection string
echo $DATABASE_URL

# 3. Test connection manually
psql $DATABASE_URL -c "SELECT 1"

# 4. Restart database service
railway restart Postgres

# 5. Increase connection pool size
# In app/database.py:
self.pool = await asyncpg.create_pool(
    settings.database_url,
    min_size=5,    # Increased from 2
    max_size=20    # Increased from 10
)
```

#### Issue: "OpenAI API rate limit exceeded"

**Symptoms:**
```
openai.RateLimitError: Rate limit reached for requests
```

**Solutions:**
```python
# 1. Implement exponential backoff
from tenacity import retry, wait_exponential, stop_after_attempt

@retry(
    wait=wait_exponential(multiplier=1, min=4, max=60),
    stop=stop_after_attempt(5)
)
async def call_openai_with_retry(prompt: str):
    return await client.chat.completions.create(...)

# 2. Increase cache TTL to reduce API calls
await redis_client.setex(cache_key, 7200, result)  # 2 hours instead of 1

# 3. Use cheaper model for non-critical operations
# Use gpt-3.5-turbo instead of gpt-4o-mini for simple queries

# 4. Batch requests when possible
```

#### Issue: "Slow search queries"

**Symptoms:**
- Response time > 2 seconds
- High database CPU usage

**Diagnosis:**
```sql
-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- Check table statistics
ANALYZE candidates;
```

**Solutions:**
```sql
-- 1. Rebuild indexes
REINDEX INDEX idx_profile_vector;

-- 2. Vacuum database
VACUUM ANALYZE candidates;

-- 3. Adjust IVFFlat parameters
DROP INDEX idx_profile_vector;
CREATE INDEX idx_profile_vector ON candidates 
USING ivfflat (profile_embedding vector_cosine_ops) 
WITH (lists = 500);  -- Adjust based on data size

-- 4. Add missing indexes
CREATE INDEX idx_company ON candidates(current_company);
```

#### Issue: "Redis connection timeout"

**Symptoms:**
```
redis.exceptions.TimeoutError: Timeout reading from socket
```

**Solutions:**
```python
# 1. Increase timeout
redis_client = redis.from_url(
    settings.redis_url,
    socket_timeout=10,  # Increased from default 5
    socket_connect_timeout=10
)

# 2. Add connection retry logic
from redis.retry import Retry
from redis.backoff import ExponentialBackoff

retry = Retry(ExponentialBackoff(), 3)
redis_client = redis.from_url(
    settings.redis_url,
    retry=retry,
    retry_on_timeout=True
)

# 3. Implement fallback (skip cache)
try:
    cached = await redis_client.get(cache_key)
except redis.exceptions.TimeoutError:
    logger.warning("Redis timeout, skipping cache")
    cached = None
```

### 13.2 Debugging Tools

**1. Database Query Profiling:**
```python
import time

async def profile_query(conn, query, *args):
    """Profile database query execution"""
    start = time.time()
    result = await conn.fetch(query, *args)
    duration = time.time() - start
    
    logger.info("Query executed", extra={
        "query": query[:100],
        "duration_ms": duration * 1000,
        "rows": len(result)
    })
    
    return result
```

**2. Request Tracing:**
```python
import uuid

@app.middleware("http")
async def add_trace_id(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    request.state.trace_id = trace_id
    
    response = await call_next(request)
    response.headers["X-Trace-ID"] = trace_id
    
    return response

# Use in logs
logger.info("Processing request", extra={"trace_id": request.state.trace_id})
```

**3. Memory Profiling:**
```python
import tracemalloc

tracemalloc.start()

# ... run operations ...

snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('lineno')

for stat in top_stats[:10]:
    print(stat)
```

### 13.3 Emergency Procedures

**Service Down:**
```bash
# 1. Check Railway status
railway status

# 2. View recent logs
railway logs --tail 100

# 3. Restart service
railway restart

# 4. Rollback to previous deployment
railway rollback

# 5. Check health endpoint
curl https://your-app.railway.app/health
```

**Database Issues:**
```bash
# 1. Check database size
railway run psql $DATABASE_URL -c "
SELECT pg_size_pretty(pg_database_size('candidates'))
"

# 2. Check active connections
railway run psql $DATABASE_URL -c "
SELECT count(*) FROM pg_stat_activity
"

# 3. Kill long-running queries
railway run psql $DATABASE_URL -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes'
"

# 4. Backup database
railway run pg_dump $DATABASE_URL > backup.sql
```

**High Load:**
```bash
# 1. Scale up workers
# Update Procfile:
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 4

# 2. Enable caching aggressively
# Increase cache TTL in app/llm.py

# 3. Add rate limiting
# See Phase 1 improvements above

# 4. Upgrade Railway plan
railway upgrade
```

### 13.4 Monitoring Checklist

**Daily:**
- [ ] Check error rate in Sentry
- [ ] Review slow query logs
- [ ] Verify cache hit rate
- [ ] Check API usage (OpenAI)

**Weekly:**
- [ ] Review database size growth
- [ ] Analyze search patterns
- [ ] Check for unused indexes
- [ ] Review and optimize slow endpoints

**Monthly:**
- [ ] Database vacuum and analyze
- [ ] Review and update dependencies
- [ ] Audit API keys and access
- [ ] Review and optimize costs

---

## 14. Handoff Checklist

### For the Next Developer:

**Before Starting:**
- [ ] Read this entire document
- [ ] Set up local development environment
- [ ] Run all tests successfully
- [ ] Deploy to personal Railway instance
- [ ] Execute sample searches

**Access Required:**
- [ ] Railway account access
- [ ] OpenAI API key
- [ ] Sentry account (if used)
- [ ] GitHub repository access
- [ ] Database credentials

**Key Files to Review:**
- [ ] `app/main.py` - Application entry point
- [ ] `app/search.py` - Core search logic
- [ ] `app/llm.py` - LLM integration
- [ ] `migrations/` - Database schema history
- [ ] `tests/` - Test suite

**Questions to Ask:**
1. What is the current production load?
2. Are there any ongoing issues?
3. What are the immediate priorities?
4. Who are the stakeholders?
5. What is the deployment schedule?

---

## 15. Contact & Resources

**Documentation:**
- FastAPI: https://fastapi.tiangolo.com/
- PostgreSQL: https://www.postgresql.org/docs/
- pgvector: https://github.com/pgvector/pgvector
- OpenAI API: https://platform.openai.com/docs/
- Railway: https://docs.railway.app/

**Support:**
- Railway Discord: https://discord.gg/railway
- FastAPI Discord: https://discord.gg/fastapi

**Code Repository:**
- GitHub: [Insert repository URL]
- Documentation: [Insert docs URL]

---

**Document End**

*This document should be updated whenever significant changes are made to the system architecture, database schema, or deployment configuration.*
