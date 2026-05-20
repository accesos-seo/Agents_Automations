FROM python:3.12-slim

# System deps for lxml + nltk data
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (better layer caching)
COPY pyproject.toml ./
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir .

# Download NLTK data needed for lemmatization
RUN python -c "import nltk; nltk.download('punkt_tab', quiet=True); nltk.download('stopwords', quiet=True); nltk.download('wordnet', quiet=True)"

# Copy app code
COPY 02-agents ./02-agents

# Railway sets $PORT
ENV PORT=8080
EXPOSE 8080

# Run FastAPI via uvicorn
CMD uvicorn 02-agents.app:app --host 0.0.0.0 --port ${PORT} --workers 2
