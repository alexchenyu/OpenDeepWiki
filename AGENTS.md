# Repository Guidelines

OpenDeepWiki blends a .NET 9 service layer with a Vite/React front end; follow these guardrails to keep contributions consistent and deployable.

## Project Structure & Module Organization
- `src/KoalaWiki` hosts the ASP.NET Core API, with domain contracts in `KoalaWiki.Domains` and shared infrastructure under `KoalaWiki.Core`.
- Database providers live in `Provider/KoalaWiki.Provider.*`, while reusable foundation helpers sit in `framework/src/OpenDeepWiki.CodeFoundation`.
- The public interface is built from `web-site`, and Python helper utilities for Neo4j and vector stores live in `server`.
- Data fixtures, sample repositories, and generated assets are parked in `data`, `repositories`, and `img`; keep large artifacts out of source control unless essential.

## Build, Test, and Development Commands
- `dotnet restore && dotnet build KoalaWiki.sln` compiles every backend project.
- `dotnet run --project src/KoalaWiki/KoalaWiki.csproj` starts the API with the default configuration.
- `cd web-site && npm install && npm run dev` serves the front end; use `npm run build` for production bundles.
- `make dev` spins up the full Docker stack; use `make build` and `make up` to rebuild and relaunch services.

## Coding Style & Naming Conventions
- C# code targets nullable-aware net9; use 4-space indentation, PascalCase for classes, camelCase for locals, and suffix async APIs with `Async`.
- Prefer dependency injection via extensions in `KoalaWiki.Core/ServiceExtensions.cs` and keep configuration in strongly typed options.
- Front-end code is TypeScript-first; organize components under `web-site/src`, name React components with PascalCase, and keep shared utilities in `/lib`.
- Run `npm run lint` before pushing to satisfy the project’s ESLint configuration; Tailwind utility classes belong in JSX rather than custom CSS when possible.

## Testing Guidelines
- The solution references xUnit; add new test projects alongside the code they exercise (e.g., `tests/KoalaWiki.Core.Tests`) and name files `*Tests.cs`.
- Execute `dotnet test KoalaWiki.sln` for backend coverage; ensure integration tests clean up generated repositories or databases.
- Front-end changes should, at minimum, include component-level assertions using Vitest or React Testing Library; co-locate specs as `ComponentName.test.tsx`.

## Commit & Pull Request Guidelines
- Follow the existing concise, imperative commit style (`fix timeout`, `optimize sync flow`) and group related changes together.
- Reference issue IDs in commit messages or PR descriptions when applicable, and add short context on risk or rollout.
- Before opening a PR, run backend build/tests and `npm run lint`; attach screenshots or terminal output for UI or CLI changes and call out configuration impacts.
