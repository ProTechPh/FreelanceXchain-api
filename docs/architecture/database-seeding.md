# Data Seeding

<cite>
**Referenced Files in This Document**
- [seed-skills.sql](file://supabase/seed-skills.sql)
- [schema.sql](file://supabase/schema.sql)
- [skill-service.ts](file://src/services/skill-service.ts)
- [skill-repository.ts](file://src/repositories/skill-repository.ts)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts)
- [supabase.ts](file://src/config/supabase.ts)
- [README.md](file://README.md)
- [matching-service.ts](file://src/services/matching-service.ts)
- [skill-routes.ts](file://src/routes/skill-routes.ts)
</cite>

## Table of Contents
1. [Introduction](#introduction)
2. [Project Structure](#project-structure)
3. [Core Components](#core-components)
4. [Architecture Overview](#architecture-overview)
5. [Detailed Component Analysis](#detailed-component-analysis)
6. [Dependency Analysis](#dependency-analysis)
7. [Performance Considerations](#performance-considerations)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Conclusion](#conclusion)

## Introduction
This document explains the data seeding process for initial database content in FreelanceXchain, focusing on the seed-skills.sql script that populates skill categories and skills for domains such as Web Development, Mobile Development, Data Science, DevOps, Design, and Blockchain. It details the use of UUIDs for stable identifiers, the ON CONFLICT DO NOTHING clause to prevent duplicates during repeated seeding, and the hierarchical relationship between categories and skills. It also describes how this seeded taxonomy supports the AI-powered matching system by providing a standardized vocabulary for freelancer skills and project requirements, and outlines when and how the seeding integrates with the database initialization workflow in development and production environments.

## Project Structure
The seeding and taxonomy-related components are organized as follows:
- Database schema and seed scripts live under supabase/.
- Application services and repositories that consume the taxonomy live under src/.

```mermaid
graph TB
subgraph "Database"
SCHEMA["supabase/schema.sql"]
SEED["supabase/seed-skills.sql"]
end
subgraph "Application"
CFG["src/config/supabase.ts"]
SRV["src/services/skill-service.ts"]
REP["src/repositories/skill-repository.ts"]
MAP["src/utils/entity-mapper.ts"]
MATCH["src/services/matching-service.ts"]
ROUTE["src/routes/skill-routes.ts"]
end
SCHEMA --> SEED
CFG --> SRV
SRV --> REP
REP --> MAP
MATCH --> SRV
ROUTE --> SRV
```

**Diagram sources**
- [schema.sql](file://supabase/schema.sql#L1-L261)
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)
- [supabase.ts](file://src/config/supabase.ts#L1-L45)
- [skill-service.ts](file://src/services/skill-service.ts#L1-L285)
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L1-L127)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L1-L120)
- [matching-service.ts](file://src/services/matching-service.ts#L1-L391)
- [skill-routes.ts](file://src/routes/skill-routes.ts#L70-L129)

**Section sources**
- [schema.sql](file://supabase/schema.sql#L1-L261)
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)
- [README.md](file://README.md#L102-L122)

## Core Components
- Seed script: Defines stable UUID identifiers for categories and skills, inserts predefined values, and uses ON CONFLICT DO NOTHING to avoid duplicates on repeated runs.
- Schema: Declares skill_categories and skills tables with UUID primary keys and foreign key relationships.
- Application services and repositories: Provide CRUD and taxonomy operations, including retrieving active skills and building hierarchical taxonomy for API clients.
- Matching service: Consumes the taxonomy to power AI skill matching, skill extraction, and skill gap analysis.

**Section sources**
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)
- [schema.sql](file://supabase/schema.sql#L19-L38)
- [skill-service.ts](file://src/services/skill-service.ts#L246-L285)
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L48-L123)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L47-L88)
- [matching-service.ts](file://src/services/matching-service.ts#L220-L269)

## Architecture Overview
The seeding process integrates with the database initialization workflow as follows:
- Developers run the schema.sql in the Supabase SQL Editor to create tables and enable extensions.
- After schema creation, developers run seed-skills.sql to populate categories and skills with stable UUIDs.
- The application’s Supabase client and repositories read the taxonomy to support skill management and AI matching.

```mermaid
sequenceDiagram
participant Dev as "Developer"
participant Supabase as "Supabase SQL Editor"
participant DB as "Supabase Database"
participant App as "Application Server"
participant Repo as "SkillRepository"
participant Map as "EntityMapper"
Dev->>Supabase : "Run supabase/schema.sql"
Supabase->>DB : "Create tables and indexes"
Dev->>Supabase : "Run supabase/seed-skills.sql"
Supabase->>DB : "Insert categories and skills<br/>with ON CONFLICT DO NOTHING"
App->>Repo : "getActiveSkills()"
Repo->>DB : "SELECT * FROM skills WHERE is_active=true ORDER BY name"
DB-->>Repo : "Rows"
Repo->>Map : "mapSkillFromEntity(...)"
Map-->>App : "Mapped Skill[]"
```

**Diagram sources**
- [schema.sql](file://supabase/schema.sql#L1-L261)
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L48-L123)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L78-L88)

## Detailed Component Analysis

### Seed Script: seed-skills.sql
- Purpose: Populate skill_categories and skills with predefined values for six domains.
- Stable identifiers: Uses explicit UUIDs for categories and skills to ensure consistent IDs across environments.
- Duplicate prevention: Uses ON CONFLICT (id) DO NOTHING to safely re-run the script without errors.
- Hierarchical structure: Each skill row references a category via category_id, establishing a parent-child relationship.
- Verification: Includes a SELECT that groups skills by category to confirm counts.

```mermaid
flowchart TD
Start(["Seed Script Execution"]) --> InsertCategories["Insert skill_categories with explicit UUIDs"]
InsertCategories --> ConflictCategories{"Duplicate category id?"}
ConflictCategories --> |Yes| SkipCategories["Skip insert (ON CONFLICT DO NOTHING)"]
ConflictCategories --> |No| ContinueCategories["Insert successful"]
ContinueCategories --> InsertSkillsWD["Insert Web Dev skills"]
InsertSkillsWD --> ConflictWD{"Duplicate skill id?"}
ConflictWD --> |Yes| SkipWD["Skip insert (ON CONFLICT DO NOTHING)"]
ConflictWD --> |No| ContinueWD["Insert successful"]
ContinueWD --> InsertSkillsMD["Insert Mobile Dev skills"]
InsertSkillsMD --> ConflictMD{"Duplicate skill id?"}
ConflictMD --> |Yes| SkipMD["Skip insert (ON CONFLICT DO NOTHING)"]
ConflictMD --> |No| ContinueMD["Insert successful"]
ContinueMD --> InsertSkillsDS["Insert Data Science skills"]
InsertSkillsDS --> ConflictDS{"Duplicate skill id?"}
ConflictDS --> |Yes| SkipDS["Skip insert (ON CONFLICT DO NOTHING)"]
ConflictDS --> |No| ContinueDS["Insert successful"]
ContinueDS --> InsertSkillsDO["Insert DevOps skills"]
InsertSkillsDO --> ConflictDO{"Duplicate skill id?"}
ConflictDO --> |Yes| SkipDO["Skip insert (ON CONFLICT DO NOTHING)"]
ConflictDO --> |No| ContinueDO["Insert successful"]
ContinueDO --> InsertSkillsDES["Insert Design skills"]
InsertSkillsDES --> ConflictDES{"Duplicate skill id?"}
ConflictDES --> |Yes| SkipDES["Skip insert (ON CONFLICT DO NOTHING)"]
ConflictDES --> |No| ContinueDES["Insert successful"]
ContinueDES --> InsertSkillsBC["Insert Blockchain skills"]
InsertSkillsBC --> ConflictBC{"Duplicate skill id?"}
ConflictBC --> |Yes| SkipBC["Skip insert (ON CONFLICT DO NOTHING)"]
ConflictBC --> |No| ContinueBC["Insert successful"]
ContinueBC --> Verify["Verify counts by category"]
Verify --> End(["Done"])
```

**Diagram sources**
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)

**Section sources**
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)

### Schema: supabase/schema.sql
- Enables UUID extension for generating stable identifiers.
- Declares skill_categories and skills tables with UUID primary keys.
- Defines foreign key relationship from skills.category_id to skill_categories.id with cascade delete.
- Adds indexes and Row Level Security policies, including public read access for skills and categories.

```mermaid
erDiagram
SKILL_CATEGORIES {
uuid id PK
string name
text description
boolean is_active
timestamptz created_at
timestamptz updated_at
}
SKILLS {
uuid id PK
uuid category_id FK
string name
text description
boolean is_active
timestamptz created_at
timestamptz updated_at
}
SKILL_CATEGORIES ||--o{ SKILLS : "has many"
```

**Diagram sources**
- [schema.sql](file://supabase/schema.sql#L19-L38)

**Section sources**
- [schema.sql](file://supabase/schema.sql#L1-L261)

### Application Services and Repositories
- SkillRepository: Provides methods to retrieve skills by category, active skills, and search by keyword. It orders results by name and filters by is_active where applicable.
- SkillService: Exposes higher-level operations such as getFullTaxonomy(), which aggregates active categories with their active skills. It also validates skill IDs and exposes search with category names.
- EntityMapper: Converts database entities (snake_case) to API models (camelCase), including Skill and SkillCategory types.

```mermaid
classDiagram
class SkillRepository {
+createSkill(skill)
+getSkillById(id)
+findSkillById(id)
+updateSkill(id, updates)
+deleteSkill(id)
+getAllSkills()
+getActiveSkills()
+getSkillsByCategory(categoryId)
+getActiveSkillsByCategory(categoryId)
+searchSkillsByKeyword(keyword)
+getSkillByNameInCategory(name, categoryId)
}
class SkillService {
+createCategory(input)
+getCategoryById(id)
+updateCategory(id, updates)
+getAllCategories()
+getActiveCategories()
+createSkill(input)
+getSkillById(id)
+updateSkill(id, updates)
+deprecateSkill(id)
+getAllSkills()
+getActiveSkills()
+getSkillsByCategory(categoryId)
+getActiveSkillsByCategory(categoryId)
+searchSkills(keyword)
+getFullTaxonomy()
+validateSkillIds(skillIds)
}
class EntityMapper {
+mapSkillCategoryFromEntity(entity)
+mapSkillFromEntity(entity)
}
SkillService --> SkillRepository : "uses"
SkillRepository --> EntityMapper : "maps"
```

**Diagram sources**
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L1-L127)
- [skill-service.ts](file://src/services/skill-service.ts#L1-L285)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L47-L88)

**Section sources**
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L1-L127)
- [skill-service.ts](file://src/services/skill-service.ts#L211-L285)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L47-L88)

### AI-Powered Matching Integration
- Skill taxonomy consumption: The matching service retrieves active skills to build a reference set for skill extraction and matching.
- Skill extraction and mapping: The matching service extracts skills from text and maps them to taxonomy IDs, using the active skill list as the controlled vocabulary.
- Recommendations: The matching service computes match scores using either AI or keyword-based methods, relying on the standardized taxonomy to compare freelancer and project skill sets.

```mermaid
sequenceDiagram
participant Client as "Client"
participant Route as "Skill Routes"
participant Service as "SkillService"
participant Repo as "SkillRepository"
participant Map as "EntityMapper"
participant Match as "MatchingService"
Client->>Route : "GET /api/skills"
Route->>Service : "getFullTaxonomy()"
Service->>Repo : "getActiveCategories()"
Repo->>Map : "mapSkillCategoryFromEntity(...)"
Service->>Repo : "getActiveSkills()"
Repo->>Map : "mapSkillFromEntity(...)"
Map-->>Service : "Mapped lists"
Service-->>Route : "SkillTaxonomy"
Route-->>Client : "200 OK"
Client->>Match : "POST /api/matching/extract-skills"
Match->>Service : "getActiveSkills()"
Service->>Repo : "getActiveSkills()"
Repo-->>Service : "Skill[]"
Service-->>Match : "Skill[]"
Match-->>Client : "ExtractedSkill[]"
```

**Diagram sources**
- [skill-routes.ts](file://src/routes/skill-routes.ts#L70-L129)
- [skill-service.ts](file://src/services/skill-service.ts#L246-L285)
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L48-L123)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L47-L88)
- [matching-service.ts](file://src/services/matching-service.ts#L220-L269)

**Section sources**
- [matching-service.ts](file://src/services/matching-service.ts#L220-L269)
- [skill-routes.ts](file://src/routes/skill-routes.ts#L70-L129)

## Dependency Analysis
- Database dependencies:
  - schema.sql defines tables and indexes; seed-skills.sql depends on these definitions.
  - ON CONFLICT DO NOTHING relies on unique constraints enforced by primary keys.
- Application dependencies:
  - SkillRepository depends on Supabase client configuration and table names.
  - SkillService depends on SkillRepository and EntityMapper.
  - MatchingService depends on SkillService to access taxonomy data.

```mermaid
graph LR
SEED["seed-skills.sql"] --> SCHEMA["schema.sql"]
SCHEMA --> DB["Supabase Database"]
CFG["supabase.ts"] --> APP["Application"]
APP --> SRV["skill-service.ts"]
SRV --> REP["skill-repository.ts"]
REP --> MAP["entity-mapper.ts"]
APP --> MATCH["matching-service.ts"]
MATCH --> SRV
```

**Diagram sources**
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)
- [schema.sql](file://supabase/schema.sql#L1-L261)
- [supabase.ts](file://src/config/supabase.ts#L1-L45)
- [skill-service.ts](file://src/services/skill-service.ts#L1-L285)
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L1-L127)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L1-L120)
- [matching-service.ts](file://src/services/matching-service.ts#L1-L391)

**Section sources**
- [schema.sql](file://supabase/schema.sql#L1-L261)
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)
- [supabase.ts](file://src/config/supabase.ts#L1-L45)
- [skill-service.ts](file://src/services/skill-service.ts#L1-L285)
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L1-L127)
- [entity-mapper.ts](file://src/utils/entity-mapper.ts#L1-L120)
- [matching-service.ts](file://src/services/matching-service.ts#L1-L391)

## Performance Considerations
- Indexes: The schema creates an index on skills(category_id), which supports efficient filtering by category and improves performance for taxonomy queries.
- Active-only queries: Using is_active filters reduces result sizes and improves matching performance.
- UUID stability: Stable UUIDs avoid costly re-mapping when data is re-seeded, minimizing churn in downstream systems.

**Section sources**
- [schema.sql](file://supabase/schema.sql#L202-L224)
- [skill-repository.ts](file://src/repositories/skill-repository.ts#L60-L94)

## Troubleshooting Guide
- Duplicate entries on re-seeding:
  - Symptom: Errors when re-running seed-skills.sql.
  - Resolution: The script uses ON CONFLICT DO NOTHING to skip duplicates. Ensure the script is executed after schema creation and that ids match the seeded values.
- Missing taxonomy data:
  - Symptom: Matching service returns empty skill lists or extraction fails.
  - Resolution: Confirm that seed-skills.sql was executed after schema.sql and that the database is reachable via the configured Supabase client.
- Connection issues:
  - Symptom: Application cannot connect to Supabase.
  - Resolution: Verify SUPABASE_URL and SUPABASE_ANON_KEY environment variables and ensure the Supabase project is healthy.

**Section sources**
- [seed-skills.sql](file://supabase/seed-skills.sql#L1-L75)
- [supabase.ts](file://src/config/supabase.ts#L1-L45)
- [README.md](file://README.md#L102-L122)

## Conclusion
The seed-skills.sql script establishes a stable, repeatable taxonomy for skills and categories, enabling consistent identification and matching across environments. Its use of UUIDs and ON CONFLICT DO NOTHING ensures safe re-execution without duplication. The schema enforces referential integrity and performance through indexes. Application services and repositories consume this taxonomy to power skill management and AI-driven matching, while the matching service leverages the standardized vocabulary for skill extraction and gap analysis. Integrating seeding into the database initialization workflow guarantees that the taxonomy is present for both development and production deployments.