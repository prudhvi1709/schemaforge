# AGENTS.md

## Cursor Cloud specific instructions

### What this is
SchemaForge is a **static, client-side single-page app** (SchemaForge). There is **no build step and no `package.json`** — every runtime dependency (Bootstrap, XLSX, GoJS, PapaParse, lit-html, `bootstrap-llm-provider`, `asyncllm`, `partial-json`, marked) is loaded from CDNs via ES module imports / `<script>` tags in `index.html` and the `js/*.js` modules. This means the app needs network access at runtime to load its libraries.

### Running the app (dev)
Serve the repo root over HTTP and open it in a browser:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

Do **not** open `index.html` via `file://` — the app uses ES modules and `fetch()`s `./prompts/*.md`, both of which require an HTTP origin.

### Core functionality requires an LLM endpoint
Schema generation, DBT rules and chat all call an **OpenAI-compatible** API. Configure it in-app via the "Configure LLM Provider" button. The config is persisted in `localStorage` under key `bootstrapLLMProvider_openaiConfig` as `{"baseUrl": "...", "apiKey": "..."}`, and is **validated with a `GET {baseUrl}/models` call** before the app will use it. The streaming calls hit `POST {baseUrl}/chat/completions` (SSE).

No API key ships in the repo. To exercise the core flow you need either a real key (OpenAI/OpenRouter/Ollama/etc.) or a local OpenAI-compatible mock that implements both `/models` and a streaming `/chat/completions`. Schema generation requests `response_format: json_object` and expects a JSON object matching `prompts/schema-generation.md`.

### Lint / format
Formatting commands are in `README.md` (prettier for `**/*.js`/`**/*.md`, js-beautify for `**/*.html`), run via `npx`. Note: these are **formatters, not pass/fail gates** — running prettier in `--check` mode currently reports style diffs against the committed files, and the README's js-beautify command uses `--replace` (edits files in place), so avoid `--replace`/`--write` unless you intend to reformat.

### Cloud Run / Google auth (optional, not locally runnable)
The "Run on Cloud" and Google sign-in features require `sandboxUrl` and `googleClientId` set in `config.json` (both are `<PLACEHOLDER>` by default) plus a reachable external sandbox exposing `/auth` and `/api/run`. These cannot be exercised locally without that external service.
