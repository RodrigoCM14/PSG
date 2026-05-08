# Pukis Hub

MVP local para organizar gastos, listas y ciclos de la casa desde un hub propio.

## Ejecutar

Para usar Zonina con OpenAI en local, crea un archivo `.env` a partir de `.env.example` y completa:

```powershell
OPENAI_API_KEY=tu_api_key
OPENAI_MODEL=gpt-5.4-mini
```

El archivo `.env` está ignorado por git.

```powershell
node server.js
```

Luego abrir `http://localhost:3000`.

## Deploy en Render

1. Sube este proyecto a un repositorio de GitHub.
2. En Render, crea un **Blueprint** apuntando al repo. El archivo `render.yaml` define el Web Service.
3. Agrega las variables privadas en Render:
   - `TMDB_READ_TOKEN`
   - `TMDB_API_KEY`
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` opcional, por defecto `gpt-5.4-mini`
   - luego, cuando Meta las entregue: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
4. Mantén el disco persistente montado en `/opt/render/project/src/data`, porque el hub guarda datos en `data/hub.json`.
5. El comando de inicio es `npm start`.

Render asigna `PORT` automáticamente y el servidor escucha en `0.0.0.0`.

Si Render intenta desplegarlo como Docker, el repo incluye un `Dockerfile`. En ese caso usa:

- Environment: `Docker`
- Dockerfile path: `./Dockerfile`
- Variables privadas: las mismas listadas arriba

## API principal

- `GET /api/info`
- `GET /api/state`
- `POST /api/expenses`
- `PATCH /api/expenses/:id`
- `DELETE /api/expenses/:id`
- `POST /api/payments`
- `POST /api/shopping/items`
- `PATCH /api/shopping/items/:id`
- `POST /api/tasks`
- `PATCH /api/tasks/:id`
- `POST /api/zonina/chat`
- `POST /api/whatsapp/simulate`
- `POST /api/discord/preview`

`/api/zonina/chat` usa OpenAI como capa conversacional si `OPENAI_API_KEY` existe. Si no está configurada, procesa el mensaje con el parser local del hub para que el chat siga funcionando.

El endpoint de WhatsApp simulado acepta:

```json
{ "from": "Rodrigo", "text": "gasté 85 en Wong" }
```
