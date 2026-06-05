FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (cached layer — only rebuilds when requirements change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (.dockerignore excludes .env, __pycache__, venv)
COPY . .

# Cloud Run injects PORT; default to 8080
ENV PORT=8080
EXPOSE 8080

# Production: no --reload, single worker (Cloud Run scales via instances not workers)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--timeout-keep-alive", "300"]
