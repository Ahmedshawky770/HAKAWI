# C4 Model Documentation
## حكاوي (Hakawi) - System Architecture Documentation

---

## Overview

This folder contains C4 model documentation for the Hakawi system. The documentation is organized by abstraction level, from high-level system context to detailed domain concepts.

---

## Folder Structure

```
c4-model/
├── README.md                    # This file
├── context/                     # C4 Level 1: System Context
│   ├── system-context.md
│   ├── actors.md
│   └── external-systems.md
├── container/                   # C4 Level 2: Container Diagram
│   ├── containers.md
│   ├── frontend.md
│   ├── backend.md
│   ├── database.md
│   └── cache.md
├── component/                   # Module Boundaries
│   └── module-boundaries.md     # Module responsibilities and contracts
└── code/                        # Domain Concepts
    └── domain-concepts.md       # Business concepts and invariants
```

---

## Documentation Levels

### Level 1: System Context
**Purpose:** Show the big picture — how the system fits into the world

**Audience:** Everyone — developers, product owners, stakeholders

**Key Documents:**
- System context diagram
- Actors and their interactions
- External systems integration

---

### Level 2: Container Diagram
**Purpose:** Show the high-level technical building blocks

**Audience:** Technical audience — developers, architects

**Key Documents:**
- Frontend containers (Next.js app)
- Backend containers (NestJS modules)
- Data containers (PostgreSQL, Valkey, Sanity)
- Infrastructure containers (Docker, message queue)

---

### Level 3: Module Boundaries
**Purpose:** Define module responsibilities, dependencies, and contracts

**Audience:** Developers

**Key Documents:**
- Module responsibilities overview
- Dependency rules
- Communication patterns
- New joiner guide

---

### Level 4: Domain Concepts
**Purpose:** Define core business concepts, relationships, and invariants

**Audience:** Developers, product owners

**Key Documents:**
- Core business concepts
- Concept relationships
- Business invariants
- Domain events

---

## How to Use

1. Start with `context/system-context.md` for the big picture
2. Move to `container/containers.md` for technical architecture
3. Reference `component/module-boundaries.md` for module responsibilities
4. Reference `code/domain-concepts.md` for business concepts

---

## Notes

- **Module boundaries** are documented separately from C4 to emphasize that they are **intended boundaries**, not current implementation.
- **Domain concepts** are documented separately from code diagrams to emphasize that they are **business concepts**, not class structures.
- These documents should evolve as the system is built. Update them when boundaries change or new concepts emerge.

---

*This is the single source of truth for Hakawi system architecture.*
