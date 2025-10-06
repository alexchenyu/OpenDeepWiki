FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
COPY main.py .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Make patch script executable
RUN chmod +x patch_mem0.sh

EXPOSE 8000

ENV PYTHONUNBUFFERED=1

# Use patch script as entrypoint
ENTRYPOINT ["/app/patch_mem0.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
